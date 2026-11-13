import { atom } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { toast } from 'sonner'
import { z } from 'zod'
import { logEventSchema, logSubscriptionAckSchema, webhookLogSchema } from '@/lib/realtime-schemas'
import type { WebhookLog } from '@/services/types'
import { getWebhookLogs } from '@/services/webhook'
import { appConnectionStatusAtom, appResyncSchema, appSocketAtom } from './realtime-app'

export const webhookLogsAtom = atom<WebhookLog[]>([])
export const selectedLogAtom = atom<WebhookLog | null>(null)
export const sessionIdAtom = atom<string | null>(null)
export const webhookIdAtom = atom<string | null>(null)
export const realtimeLogsStatusAtom = atom<'idle' | 'connecting' | 'open' | 'closed' | 'error'>(
  'idle',
)

export const realtimeLogsEffectAtom = atomEffect((get, set) => {
  const socket = get(appSocketAtom)
  const sessionId = get(sessionIdAtom)
  const webhookId = get(webhookIdAtom)
  if (!socket || !sessionId || !webhookId) return
  let disposed = false
  let subscribed = false
  let generation = 0
  let refreshing = false
  let refreshPending = false
  const scope = { sessionId, webhookId }
  const merge = (incoming: WebhookLog[]) => {
    set(webhookLogsAtom, (previous) =>
      [...new Map([...incoming, ...previous].map((log) => [log.id, log])).values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .slice(0, 500),
    )
  }
  const refresh = async () => {
    if (disposed || !subscribed || !socket.connected) return
    refreshPending = true
    if (refreshing) return
    refreshing = true
    try {
      do {
        refreshPending = false
        const current = generation
        const selectedAtStart = get.peek(selectedLogAtom)
        try {
          const response = await getWebhookLogs(sessionId, webhookId, { page: 1, pageSize: 100 })
          if (disposed || current !== generation || !subscribed) continue
          const logs = z
            .array(webhookLogSchema)
            .parse(response.data)
            .filter((log) => log.sessionId === sessionId && log.webhookId === webhookId)
          const known = new Set(get.peek(webhookLogsAtom).map((log) => log.id))
          merge(logs)
          const newest = get.peek(webhookLogsAtom).find((log) => !known.has(log.id))
          const selected = get.peek(selectedLogAtom)
          if (
            newest &&
            selected === selectedAtStart &&
            (!selected ||
              newest.createdAt > selected.createdAt ||
              (newest.createdAt === selected.createdAt && newest.id > selected.id))
          )
            set(selectedLogAtom, newest)
          else if (!get.peek(selectedLogAtom))
            set(selectedLogAtom, get.peek(webhookLogsAtom)[0] ?? null)
          set(realtimeLogsStatusAtom, 'open')
        } catch (error: unknown) {
          if (!disposed && current === generation && subscribed) {
            set(realtimeLogsStatusAtom, 'error')
            toast.error('Não foi possível recuperar os logs recentes', {
              description: error instanceof Error ? error.message : 'Falha ao carregar histórico',
              id: `logs:${sessionId}:${webhookId}:snapshot`,
            })
          }
        }
      } while (refreshPending && !disposed && subscribed && socket.connected)
    } finally {
      refreshing = false
    }
  }
  const resync = (raw: unknown) => {
    if (appResyncSchema.safeParse(raw).success) void refresh()
  }
  const subscribe = () => {
    const current = ++generation
    subscribed = false
    set(realtimeLogsStatusAtom, 'connecting')
    socket.timeout(5000).emit('logs.subscribe', scope, (error: Error | null, raw: unknown) => {
      if (disposed || current !== generation) return
      const result = logSubscriptionAckSchema.safeParse(raw)
      if (
        error ||
        !result.success ||
        !result.data.ok ||
        !result.data.data.subscribed ||
        result.data.data.sessionId !== sessionId ||
        result.data.data.webhookId !== webhookId
      ) {
        set(realtimeLogsStatusAtom, 'error')
        return
      }
      subscribed = true
      // Subscribe first, then merge a bounded persisted snapshot with live arrivals.
      void refresh()
    })
  }
  const entry = (raw: unknown) => {
    const parsed = logEventSchema.safeParse(raw)
    if (
      disposed ||
      !subscribed ||
      !parsed.success ||
      parsed.data.data.sessionId !== sessionId ||
      parsed.data.data.webhookId !== webhookId
    )
      return
    const log = parsed.data.data
    if (get.peek(webhookLogsAtom).some((item) => item.id === log.id)) return
    merge([log])
    set(selectedLogAtom, log)
  }
  const closed = () => {
    generation++
    subscribed = false
    set(realtimeLogsStatusAtom, 'closed')
  }
  const failed = () => {
    generation++
    subscribed = false
    set(realtimeLogsStatusAtom, 'error')
  }
  const revoked = (raw: unknown) => {
    const parsed = z.object({ sessionId: z.string(), webhookId: z.string() }).safeParse(raw)
    if (
      !parsed.success ||
      parsed.data.sessionId !== sessionId ||
      parsed.data.webhookId !== webhookId
    )
      return
    failed()
    set(webhookLogsAtom, [])
    set(selectedLogAtom, null)
  }
  socket.on('connect', subscribe)
  socket.on('disconnect', closed)
  socket.on('connect_error', failed)
  socket.on('logs.entry', entry)
  socket.on('logs.revoked', revoked)
  socket.on('app.resync', resync)
  if (socket.connected) subscribe()
  else
    set(
      realtimeLogsStatusAtom,
      get.peek(appConnectionStatusAtom) === 'error' ? 'error' : 'connecting',
    )
  return () => {
    disposed = true
    generation++
    if (socket.connected) socket.emit('logs.unsubscribe', scope, () => {})
    socket.off('connect', subscribe)
    socket.off('disconnect', closed)
    socket.off('connect_error', failed)
    socket.off('logs.entry', entry)
    socket.off('logs.revoked', revoked)
    socket.off('app.resync', resync)
    set(realtimeLogsStatusAtom, 'idle')
    set(webhookLogsAtom, [])
    set(selectedLogAtom, null)
    toast.dismiss(`logs:${sessionId}:${webhookId}:snapshot`)
  }
})
