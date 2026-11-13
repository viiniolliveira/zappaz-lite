import type { Query } from '@tanstack/react-query'
import { atom } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { ApiError } from '@/lib/api-error'
import { chatKeys, mergeEntities } from '@/lib/chat/merge'
import {
  chatEventSchema,
  contactSchema,
  conversationSchema,
  historySyncProgressSchema,
  mediaSchema,
  messageSchema,
  subscribeAckSchema,
} from '@/lib/chat/schemas'
import {
  applyChatConversationsAtom,
  applyChatMessagesAtom,
  chatAccessDeniedAtom,
  chatConnectionStatusAtom,
  chatDeletedConversationIdsAtom,
  chatLiveCacheAtom,
  chatOptimisticMessagesAtom,
  chatReconnectAttemptAtom,
  chatSessionStateAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
  forgetChatConversationAtom,
} from './chat-cache'
import { chatTypingAtom } from './chat-typing'
import { appConnectionStatusAtom, appResyncSchema, appSocketAtom } from './realtime-app'
import {
  chatBulkLabelsOpenAtom,
  chatContactFormAtom,
  chatContactPanelAtom,
  chatContactQueryAtom,
  chatContactSearchAtom,
  chatConversationQueryAtom,
  chatConversationSearchAtom,
  chatConversationSelectionAtom,
  chatDeleteContactAtom,
  chatDeleteConversationIdsAtom,
  chatDraftsAtom,
  chatLabelFilterAtom,
  chatLabelManagerAtom,
  chatLabelTargetAtom,
  chatSessionIdAtom,
  clearChatSessionDraftsAtom,
  selectedChatIdAtom,
} from './ui'

const contactEvent = chatEventSchema(z.object({ contact: contactSchema }))
const typingEvent = chatEventSchema(z.object({ conversationId: z.uuid() }))
export const acknowledgeChatSyncErrorAtom = atom(
  null,
  async (get, _set, input: { sessionId: string; errorId: string }) => {
    const socket = get(appSocketAtom)
    try {
      if (!socket?.connected) throw new Error('Chat desconectado')
      const result: unknown = await socket
        .timeout(10000)
        .emitWithAck('chat.sync.acknowledge', input)
      if (!z.object({ ok: z.literal(true) }).safeParse(result).success) {
        throw new Error('Confirmação recusada')
      }
    } catch {
      toast.error('Não foi possível dispensar o aviso de sincronização. Tente novamente.')
    }
  },
)
const conversationEvent = chatEventSchema(z.object({ conversation: conversationSchema }))
const conversationDeletedEvent = chatEventSchema(
  z.object({ conversationId: z.uuid(), deletedAt: z.iso.datetime() }),
)
const messageEvent = chatEventSchema(
  z.object({ message: messageSchema, source: z.enum(['live', 'history', 'send', 'update']) }),
)
const mediaEvent = chatEventSchema(z.object({ media: mediaSchema, message: messageSchema }))
const stateEvent = chatEventSchema(
  z.object({
    sessionId: z.uuid(),
    connected: z.boolean(),
    enabled: z.boolean(),
    syncStatus: z.enum(['idle', 'syncing', 'error']),
    syncProgress: historySyncProgressSchema.optional(),
  }),
)

const chatWhatsappConnectedAtom = atom((get) => get(chatSessionStateAtom)?.connected === true)

export const chatPresenceEffectAtom = atomEffect((get) => {
  const sessionId = get(chatSessionIdAtom)
  const conversationId = get(selectedChatIdAtom)
  const socket = get(appSocketAtom)
  const subscribed = get(chatSubscribedAtom)
  const subscribedSessionId = get(chatSubscribedSessionIdAtom)
  const status = get(chatConnectionStatusAtom)
  const connected = get(chatWhatsappConnectedAtom)
  if (
    !sessionId ||
    !conversationId ||
    !socket?.connected ||
    !subscribed ||
    subscribedSessionId !== sessionId ||
    status !== 'open' ||
    !connected
  )
    return
  let disposed = false
  socket
    .timeout(5000)
    .emit(
      'chat.presence.subscribe',
      { sessionId, conversationId },
      (error: Error | null, response: unknown) => {
        if (disposed) return
        if (error || !z.object({ ok: z.literal(true) }).safeParse(response).success)
          toast.error('Não foi possível acompanhar a digitação desta conversa.')
      },
    )
  return () => {
    disposed = true
  }
})

export const realtimeChatEffectAtom = atomEffect((get, set) => {
  const sessionId = get(chatSessionIdAtom)
  const socket = get(appSocketAtom)
  const queryClient = get(queryClientAtom)
  const reconnectAttemptNumber = get(chatReconnectAttemptAtom)
  if (!socket || !sessionId || get(chatAccessDeniedAtom)) return
  let disposed = false
  let authBlocked = false
  let subscriptionGeneration = 0
  let subscriptionRequest: Promise<boolean> | undefined
  let refreshing = false
  let refreshPending = false
  let stateRefreshPending = false
  const events = new Set<string>()
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const clearTyping = (conversationId: string) => {
    if (!typingTimers.has(conversationId)) return
    clearTimeout(typingTimers.get(conversationId))
    typingTimers.delete(conversationId)
    set(chatTypingAtom, (current) => {
      const next = { ...current }
      delete next[`${sessionId}/${conversationId}`]
      return next
    })
  }
  const clearAllTyping = () => {
    for (const conversationId of typingTimers.keys()) clearTyping(conversationId)
  }
  set(chatConnectionStatusAtom, socket.connected ? 'connecting' : get.peek(appConnectionStatusAtom))
  const disposers: (() => void)[] = []
  const on: typeof socket.on = (event, listener) => {
    socket.on(event, listener)
    disposers.push(() => {
      socket.off(event, listener)
    })
    return socket
  }
  const loseAccess = (code: string) => {
    clearAllTyping()
    authBlocked = true
    set(chatAccessDeniedAtom, true)
    set(chatSubscribedAtom, false)
    set(chatSubscribedSessionIdAtom, null)
    set(chatConnectionStatusAtom, code === 'UNAUTHORIZED' ? 'unauthorized' : 'forbidden')
    set(chatLiveCacheAtom, { contacts: [], conversations: [], messages: [] })
    set(chatOptimisticMessagesAtom, [])
    if (code === 'UNAUTHORIZED') set(chatDraftsAtom, {})
    else set(clearChatSessionDraftsAtom, sessionId)
    set(chatContactFormAtom, null)
    set(chatContactPanelAtom, null)
    set(chatDeleteContactAtom, null)
    set(chatConversationSelectionAtom, null)
    set(chatDeleteConversationIdsAtom, [])
    set(chatContactSearchAtom, '')
    set(chatConversationSearchAtom, '')
    set(chatContactQueryAtom, '')
    set(chatConversationQueryAtom, '')
    set(chatLabelFilterAtom, null)
    set(chatLabelManagerAtom, null)
    set(chatLabelTargetAtom, null)
    set(chatBulkLabelsOpenAtom, false)
    void queryClient.cancelQueries({ queryKey: chatKeys.session(sessionId) })
    queryClient.removeQueries({ queryKey: chatKeys.session(sessionId) })
    if (socket.connected) socket.emit('chat.session.unsubscribe', { sessionId }, () => {})
  }
  const accept = (event: { eventId: string; sessionId: string }) => {
    if (disposed || authBlocked || event.sessionId !== sessionId || events.has(event.eventId))
      return false
    events.add(event.eventId)
    if (events.size > 1000) events.delete(events.values().next().value ?? '')
    return true
  }
  const subscribe = (): Promise<boolean> => {
    if (subscriptionRequest) return subscriptionRequest
    const generation = ++subscriptionGeneration
    const request = new Promise<boolean>((resolve) => {
      socket
        .timeout(5000)
        .emit('chat.session.subscribe', { sessionId }, (error: Error | null, raw: unknown) => {
          if (disposed || authBlocked || generation !== subscriptionGeneration)
            return resolve(false)
          const result = subscribeAckSchema.safeParse(raw)
          if (error || !result.success) {
            set(chatConnectionStatusAtom, 'error')
            return resolve(false)
          }
          const ack = result.data
          if (!ack.ok) {
            if (ack.error.code === 'UNAUTHORIZED' || ack.error.code === 'FORBIDDEN')
              loseAccess(ack.error.code)
            else {
              set(chatConnectionStatusAtom, 'error')
            }
            return resolve(false)
          }
          if (ack.data.sessionId !== sessionId || !ack.data.subscribed) {
            set(chatConnectionStatusAtom, 'error')
            return resolve(false)
          }
          set(chatSubscribedAtom, true)
          set(chatSubscribedSessionIdAtom, sessionId)
          set(chatConnectionStatusAtom, 'open')
          resolve(true)
        })
    })
    subscriptionRequest = request
    void request.finally(() => {
      if (subscriptionRequest === request) subscriptionRequest = undefined
    })
    return request
  }
  const reconcile = async (refreshState = true) => {
    if (disposed || authBlocked || !socket.connected) return
    refreshPending = true
    stateRefreshPending ||= refreshState
    if (refreshing) return
    refreshing = true
    try {
      do {
        refreshPending = false
        // A transient subscription-budget denial must not prevent HTTP recovery.
        const refreshSessionState = stateRefreshPending
        stateRefreshPending = false
        if (refreshSessionState) await subscribe()
        const generation = subscriptionGeneration
        if (disposed || authBlocked || !socket.connected) return
        // Drop the old overlay, not drafts or pending sends. Events arriving during
        // the snapshot build a new overlay; absent/deleted entities cannot return.
        set(chatLiveCacheAtom, { contacts: [], conversations: [], messages: [] })
        await queryClient.invalidateQueries({
          queryKey: chatKeys.session(sessionId),
          refetchType: 'none',
        })
        if (disposed || authBlocked || generation !== subscriptionGeneration) continue
        // Infinite queries refetch every loaded page, including late history/edits.
        const filters = {
          queryKey: chatKeys.session(sessionId),
          type: 'all',
          predicate: (query: Query) => !query.isDisabled() && !query.isStatic(),
        } as const
        if (refreshSessionState && queryClient.isFetching(filters)) refreshPending = true
        await queryClient.refetchQueries(filters, { cancelRefetch: false })
        if (disposed || authBlocked || generation !== subscriptionGeneration) continue
        for (const query of queryClient
          .getQueryCache()
          .findAll({ queryKey: chatKeys.session(sessionId) })) {
          const [, , resource, conversationId] = query.queryKey
          if (
            (resource !== 'conversation' && resource !== 'messages') ||
            typeof conversationId !== 'string'
          )
            continue
          if (!(query.state.error instanceof ApiError) || query.state.error.status !== 404) continue
          set(chatDeletedConversationIdsAtom, (ids) => ({
            ...ids,
            [sessionId]: [...new Set([...(ids[sessionId] ?? []), conversationId])],
          }))
          set(chatLiveCacheAtom, (cache) => ({
            ...cache,
            conversations: cache.conversations.filter((item) => item.id !== conversationId),
            messages: cache.messages.filter((item) => item.conversationId !== conversationId),
          }))
          if (get.peek(selectedChatIdAtom) === conversationId) set(selectedChatIdAtom, null)
          queryClient.removeQueries({ queryKey: chatKeys.conversation(sessionId, conversationId) })
          queryClient.removeQueries({ queryKey: chatKeys.messages(sessionId, conversationId) })
        }
      } while (refreshPending && !disposed && !authBlocked && socket.connected)
    } finally {
      refreshing = false
    }
  }
  const connected = () => {
    void subscribe().then((ok) => {
      if (ok) void reconcile(false)
    })
  }
  on('connect', connected)
  on('app.resync', (raw: unknown) => {
    if (appResyncSchema.safeParse(raw).success) void reconcile()
  })
  on('chat.typing', (raw: unknown) => {
    const result = typingEvent.safeParse(raw)
    if (!result.success || !accept(result.data) || !get.peek(chatSubscribedAtom)) return
    const { conversationId } = result.data.data
    if ((get.peek(chatDeletedConversationIdsAtom)[sessionId] ?? []).includes(conversationId)) return
    clearTimeout(typingTimers.get(conversationId))
    set(chatTypingAtom, (current) => ({ ...current, [`${sessionId}/${conversationId}`]: true }))
    typingTimers.set(
      conversationId,
      setTimeout(() => clearTyping(conversationId), 5000),
    )
  })
  on('chat.session.revoked', (raw: unknown) => {
    const parsed = z.object({ sessionId: z.string() }).safeParse(raw)
    if (parsed.success && parsed.data.sessionId === sessionId) loseAccess('FORBIDDEN')
  })
  on('chat.contact.upserted', (raw: unknown) => {
    const result = contactEvent.safeParse(raw)
    if (!result.success || !accept(result.data) || result.data.data.contact.sessionId !== sessionId)
      return
    const contact = result.data.data.contact
    const wasSaved = get
      .peek(chatLiveCacheAtom)
      .contacts.some((item) => item.id === contact.id && item.isSaved)
    set(chatLiveCacheAtom, (cache) => ({
      ...cache,
      contacts: mergeEntities(cache.contacts, [result.data.data.contact], sessionId),
    }))
    if (contact.isSaved || wasSaved)
      void queryClient.invalidateQueries({ queryKey: chatKeys.contacts(sessionId).slice(0, 3) })
  })
  on('chat.conversation.upserted', (raw: unknown) => {
    const result = conversationEvent.safeParse(raw)
    if (result.success && accept(result.data))
      set(applyChatConversationsAtom, [result.data.data.conversation])
  })
  on('chat.conversation.deleted', (raw: unknown) => {
    const result = conversationDeletedEvent.safeParse(raw)
    if (result.success && accept(result.data)) {
      clearTyping(result.data.data.conversationId)
      set(forgetChatConversationAtom, {
        sessionId,
        conversationId: result.data.data.conversationId,
      })
      void queryClient.invalidateQueries({ queryKey: [...chatKeys.session(sessionId), 'library'] })
    }
  })
  on('chat.message.upserted', (raw: unknown) => {
    const result = messageEvent.safeParse(raw)
    if (result.success && accept(result.data)) {
      const message = result.data.data.message
      if (message.sessionId === sessionId && !message.fromMe && result.data.data.source === 'live')
        clearTyping(message.conversationId)
      set(applyChatMessagesAtom, [message])
      void queryClient.invalidateQueries({ queryKey: [...chatKeys.session(sessionId), 'library'] })
      if (message.type === 'image' || message.type === 'video' || message.type === 'document')
        void queryClient.invalidateQueries({
          queryKey: chatKeys.contactMedia(sessionId, message.conversationId),
        })
      else {
        void queryClient.invalidateQueries({
          queryKey: [...chatKeys.contactMedia(sessionId, message.conversationId), 'summary'],
        })
        void queryClient.invalidateQueries({
          queryKey: [...chatKeys.contactMedia(sessionId, message.conversationId), 'library'],
        })
      }
    }
  })
  on('chat.media.updated', (raw: unknown) => {
    const result = mediaEvent.safeParse(raw)
    if (!result.success || !accept(result.data)) return
    const { media, message } = result.data.data
    if (
      media.sessionId !== sessionId ||
      media.conversationId !== message.conversationId ||
      media.messageRecordId !== message.id
    )
      return
    set(applyChatMessagesAtom, [message])
    void queryClient.invalidateQueries({ queryKey: [...chatKeys.session(sessionId), 'library'] })
    void queryClient.invalidateQueries({
      queryKey: chatKeys.contactMedia(sessionId, message.conversationId),
    })
  })
  on('chat.session.state', (raw: unknown) => {
    const result = stateEvent.safeParse(raw)
    if (!result.success || !accept(result.data) || result.data.data.sessionId !== sessionId) return
    set(chatSessionStateAtom, result.data.data)
    if (!result.data.data.connected) clearAllTyping()
  })
  on('disconnect', () => {
    clearAllTyping()
    if (disposed || authBlocked) return
    subscriptionGeneration++
    subscriptionRequest = undefined
    set(chatSubscribedAtom, false)
    set(chatSubscribedSessionIdAtom, null)
    set(chatConnectionStatusAtom, 'closed')
  })
  on('connect_error', (error: Error & { data?: { code?: string } }) => {
    if (disposed || authBlocked) return
    const code = error.data?.code
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') loseAccess(code)
    else set(chatConnectionStatusAtom, 'error')
  })
  const reconnectAttempt = () => {
    if (!disposed && !authBlocked) set(chatConnectionStatusAtom, 'connecting')
  }
  socket.io.on('reconnect_attempt', reconnectAttempt)
  if (socket.connected) connected()
  else if (reconnectAttemptNumber > 0 && get.peek(appConnectionStatusAtom) !== 'unauthorized')
    socket.connect()
  return () => {
    disposed = true
    clearAllTyping()
    if (socket.connected) socket.emit('chat.session.unsubscribe', { sessionId }, () => {})
    for (const dispose of disposers) dispose()
    socket.io.off('reconnect_attempt', reconnectAttempt)
    events.clear()
    set(chatSubscribedAtom, false)
    set(chatSubscribedSessionIdAtom, null)
    if (!get(chatAccessDeniedAtom)) set(chatConnectionStatusAtom, 'idle')
    set(chatSessionStateAtom, null)
    set(chatLiveCacheAtom, { contacts: [], conversations: [], messages: [] })
    set(chatOptimisticMessagesAtom, [])
    set(chatContactFormAtom, null)
    set(chatContactPanelAtom, null)
    set(chatDeleteContactAtom, null)
    set(chatContactSearchAtom, '')
    set(chatConversationSearchAtom, '')
    set(chatContactQueryAtom, '')
    set(chatConversationQueryAtom, '')
    set(chatLabelFilterAtom, null)
    set(chatLabelManagerAtom, null)
    set(chatLabelTargetAtom, null)
    set(chatBulkLabelsOpenAtom, false)
    void queryClient.cancelQueries({ queryKey: chatKeys.session(sessionId) })
    queryClient.removeQueries({ queryKey: chatKeys.session(sessionId) })
  }
})
