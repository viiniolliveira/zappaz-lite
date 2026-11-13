import type { Query } from '@tanstack/react-query'
import { atom } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { queryClientAtom } from 'jotai-tanstack-query'
import { io, type Socket } from 'socket.io-client'
import { z } from 'zod'
import { API_URL, api } from '@/lib/api-client'
import { chatKeys } from '@/lib/chat/merge'
import { logRevisionAtom } from './log-updates'
import { sessionKeys } from './session'
import {
  chatSessionIdAtom,
  clearChatSessionDraftsAtom,
  connectSessionIdAtom,
  isConnectSessionModalOpenAtom,
} from './ui'
import { webhookKeys } from './webhook'

export const appSocketAtom = atom<Socket | null>(null)
export const appResyncSchema = z.object({ version: z.literal(1) })
export const appConnectionStatusAtom = atom<
  'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'unauthorized'
>('idle')
const invalidationSchema = z
  .object({
    version: z.literal(1),
    eventId: z.uuid(),
    resource: z.enum([
      'sessions',
      'webhooks',
      'usage',
      'logs',
      'conversation-labels',
      'quick-messages',
    ]),
    sessionId: z.string().min(1),
    webhookId: z.string().nullable(),
    deleted: z.boolean(),
  })
  .refine((event) => event.resource !== 'logs' || !!event.webhookId)

export const realtimeAppEffectAtom = atomEffect((get, set) => {
  const queryClient = get(queryClientAtom)
  const socket = io(API_URL || window.location.origin, {
    path: '/api/ws',
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: false,
  })
  let disposed = false
  let blocked = false
  let connectedBefore = false
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = 10000
  let refreshing = false
  let refreshPending = false
  const events = new Set<string>()
  const pending = new Map<string, z.infer<typeof invalidationSchema>>()
  const pendingActivity = new Map<
    string,
    Pick<z.infer<typeof invalidationSchema>, 'resource' | 'sessionId' | 'webhookId'>
  >()
  let timer: ReturnType<typeof setTimeout> | undefined
  let activityTimer: ReturnType<typeof setTimeout> | undefined
  const firstLogPage = (query: Query) => {
    const params = query.queryKey[4]
    return (
      !!params &&
      typeof params === 'object' &&
      'page' in params &&
      (params.page === undefined || params.page === 1)
    )
  }
  const refetchActivity = (
    event: Pick<z.infer<typeof invalidationSchema>, 'resource' | 'sessionId' | 'webhookId'>,
    queryKey: readonly unknown[],
    predicate?: (query: Query) => boolean,
  ) => {
    void queryClient.invalidateQueries({ queryKey, refetchType: 'none' })
    const filters = { queryKey, type: 'active' as const, predicate }
    if (queryClient.isFetching(filters)) {
      // Preserve a trailing refresh if an event arrives during a slow snapshot request.
      pendingActivity.set(`${event.resource}:${event.sessionId}:${event.webhookId ?? ''}`, event)
      activityTimer ??= setTimeout(flushActivity, 1000)
      return
    }
    void queryClient.refetchQueries(filters, { cancelRefetch: false })
  }
  const updateLogs = (sessionId: string, webhookId: string) => {
    const queryKey = webhookKeys.logs(sessionId, webhookId)
    refetchActivity({ resource: 'logs', sessionId, webhookId }, queryKey, firstLogPage)
    set(logRevisionAtom(`${sessionId}:${webhookId}`), (revision) => revision + 1)
  }
  const flushActivity = () => {
    activityTimer = undefined
    const updates = [...pendingActivity.values()]
    pendingActivity.clear()
    for (const event of updates) {
      if (event.resource === 'conversation-labels') {
        void queryClient.invalidateQueries({
          queryKey: [...chatKeys.session(event.sessionId), 'labels'],
        })
        void queryClient.invalidateQueries({
          queryKey: chatKeys.conversations(event.sessionId).slice(0, 3),
        })
        void queryClient.invalidateQueries({
          queryKey: [...chatKeys.session(event.sessionId), 'conversation'],
        })
        continue
      }
      if (event.resource === 'usage') refetchActivity(event, sessionKeys.history(event.sessionId))
      else if (event.webhookId) updateLogs(event.sessionId, event.webhookId)
    }
  }
  const flush = () => {
    timer = undefined
    const updates = [...pending.values()]
    pending.clear()
    if (updates.some((event) => event.resource === 'sessions'))
      void queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
    for (const event of updates) {
      if (event.resource === 'quick-messages') {
        void queryClient.invalidateQueries({
          queryKey: [...chatKeys.session(event.sessionId), 'quick-messages'],
        })
        continue
      }
      void queryClient.invalidateQueries({
        queryKey:
          event.resource === 'sessions'
            ? sessionKeys.detail(event.sessionId)
            : webhookKeys.list(event.sessionId),
      })
    }
  }
  socket.on('app.invalidate', (raw: unknown) => {
    const parsed = invalidationSchema.safeParse(raw)
    if (disposed || blocked || !parsed.success || events.has(parsed.data.eventId)) return
    const event = parsed.data
    events.add(event.eventId)
    if (events.size > 1000) events.delete(events.values().next().value ?? '')
    if (event.resource === 'sessions' && event.deleted) {
      set(clearChatSessionDraftsAtom, event.sessionId)
      if (get.peek(chatSessionIdAtom) === event.sessionId) set(chatSessionIdAtom, null)
      if (get.peek(connectSessionIdAtom) === event.sessionId) {
        set(isConnectSessionModalOpenAtom, false)
        set(connectSessionIdAtom, null)
      }
    }
    if (event.resource === 'logs' || event.resource === 'usage') {
      pendingActivity.set(`${event.resource}:${event.sessionId}:${event.webhookId ?? ''}`, event)
      activityTimer ??= setTimeout(flushActivity, 1000)
    } else {
      pending.set(`${event.resource}:${event.sessionId}`, event)
      timer ??= setTimeout(flush, 100)
    }
  })
  const reconcile = async (refreshAfterOngoing = true) => {
    if (disposed || blocked || !socket.connected) return
    refreshPending = true
    if (refreshing) return
    refreshing = true
    try {
      do {
        refreshPending = false
        // Chat owns its snapshots/live overlay; never cancel an ongoing snapshot.
        await queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== 'chat',
          refetchType: 'none',
        })
        if (disposed || blocked || !socket.connected) return
        const scopes = new Set<string>()
        for (const query of queryClient
          .getQueryCache()
          .findAll({ queryKey: ['webhooks', 'logs'] })) {
          const [, , sessionId, webhookId] = query.queryKey
          if (typeof sessionId === 'string' && typeof webhookId === 'string')
            scopes.add(`${sessionId}:${webhookId}`)
        }
        for (const scope of scopes) set(logRevisionAtom(scope), (revision) => revision + 1)
        const filters = {
          type: 'active',
          predicate: (query: Query) =>
            !query.isDisabled() &&
            !query.isStatic() &&
            query.queryKey[0] !== 'chat' &&
            (!(query.queryKey[0] === 'webhooks' && query.queryKey[1] === 'logs') ||
              firstLogPage(query)),
        } as const
        // An already running request may predate this signal. Await it, then
        // take one fresh snapshot rather than repeatedly cancelling the request.
        if (refreshAfterOngoing && queryClient.isFetching(filters)) refreshPending = true
        refreshAfterOngoing = false
        await queryClient.refetchQueries(filters, { cancelRefetch: false })
      } while (refreshPending && !disposed && !blocked && socket.connected)
    } finally {
      refreshing = false
    }
  }
  socket.on('app.resync', (raw: unknown) => {
    if (appResyncSchema.safeParse(raw).success) void reconcile()
  })
  socket.on('connect', () => {
    if (disposed || blocked) return
    clearTimeout(retryTimer)
    retryTimer = undefined
    retryDelay = 10000
    set(appConnectionStatusAtom, 'open')
    const reconnecting = connectedBefore
    connectedBefore = true
    void reconcile(reconnecting)
  })
  socket.on('disconnect', (reason: string) => {
    if (disposed || blocked) return
    set(appConnectionStatusAtom, 'closed')
    if (reason === 'io server disconnect') socket.connect()
  })
  socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
    if (disposed || blocked) return
    blocked = error.data?.code === 'UNAUTHORIZED'
    set(appConnectionStatusAtom, blocked ? 'unauthorized' : 'error')
    if (blocked) {
      clearTimeout(retryTimer)
      retryTimer = undefined
      socket.disconnect()
    } else if (error.data?.code === 'RATE_LIMITED' && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        if (disposed || blocked || socket.connected) return
        set(appConnectionStatusAtom, 'connecting')
        socket.connect()
      }, retryDelay)
      retryDelay = Math.min(retryDelay + 10000, 30000)
    }
  })
  const attempt = () => {
    if (!disposed && !blocked) set(appConnectionStatusAtom, 'connecting')
  }
  socket.io.on('reconnect_attempt', attempt)
  const reconnect = () => {
    if (!disposed && !blocked && !retryTimer && !socket.connected) socket.connect()
  }
  const visibility = () => {
    if (document.visibilityState === 'visible') reconnect()
  }
  const offline = () => {
    if (!blocked) set(appConnectionStatusAtom, 'closed')
  }
  const interceptor = api.interceptors.request.use((request) => {
    if (
      socket.connected &&
      socket.id &&
      !['get', 'head', 'options'].includes(request.method?.toLowerCase() ?? 'get')
    ) {
      request.headers.set('X-Realtime-Socket-Id', socket.id)
    }
    return request
  })
  window.addEventListener('online', reconnect)
  window.addEventListener('offline', offline)
  document.addEventListener('visibilitychange', visibility)
  set(appSocketAtom, socket)
  set(appConnectionStatusAtom, 'connecting')
  socket.connect()
  return () => {
    disposed = true
    clearTimeout(timer)
    clearTimeout(activityTimer)
    clearTimeout(retryTimer)
    pending.clear()
    pendingActivity.clear()
    api.interceptors.request.eject(interceptor)
    window.removeEventListener('online', reconnect)
    window.removeEventListener('offline', offline)
    document.removeEventListener('visibilitychange', visibility)
    socket.io.off('reconnect_attempt', attempt)
    socket.removeAllListeners()
    socket.disconnect()
    set(appSocketAtom, null)
    set(appConnectionStatusAtom, 'idle')
  }
})
