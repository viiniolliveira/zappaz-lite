import type { InfiniteData } from '@tanstack/react-query'
import { atom } from 'jotai'
import { atomEffect } from 'jotai-effect'
import { atomWithInfiniteQuery, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { ApiError } from '@/lib/api-error'
import { chatKeys, mergeConversations, mergeEntities, mergeMessages } from '@/lib/chat/merge'
import type { ContactDTO, ConversationDTO, MessageDTO } from '@/lib/chat/schemas'
import type { ChatMessage } from '@/lib/chat/types'
import { getChatConversation, getChatConversations, getChatMessages } from '@/services/chat'
import {
  chatConversationQueryAtom,
  chatConversationSelectionAtom,
  chatDeleteConversationIdsAtom,
  chatDraftsAtom,
  chatLabelFilterAtom,
  chatSessionIdAtom,
  selectedChatIdAtom,
} from './ui'

export { chatKeys }
export const chatSubscribedAtom = atom(false)
export const chatSubscribedSessionIdAtom = atom<string | null>(null)
export const chatAccessDeniedAtom = atom(false)
export const chatReconnectAttemptAtom = atom(0)
export const chatConnectionStatusAtom = atom<
  'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'unauthorized' | 'forbidden'
>('idle')
export const chatSessionStateAtom = atom<{
  connected: boolean
  enabled: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  syncProgress?: {
    errorId?: string
    phase: 'saving' | 'waiting' | 'complete' | 'error'
    messages: number
    contacts: number
    conversations: number
  }
} | null>(null)
export const chatLiveCacheAtom = atom<{
  contacts: ContactDTO[]
  conversations: ConversationDTO[]
  messages: MessageDTO[]
}>({ contacts: [], conversations: [], messages: [] })
export const chatOptimisticMessagesAtom = atom<ChatMessage[]>([])
// A deleted UUID can never return, even from an older REST response/socket event.
export const chatDeletedConversationIdsAtom = atom<Record<string, string[]>>({})
export const forgetChatConversationAtom = atom(
  null,
  (get, set, payload: { sessionId: string; conversationId: string }) => {
    const { sessionId, conversationId } = payload
    set(chatDraftsAtom, (drafts) => {
      const next = { ...drafts }
      delete next[`${sessionId}/${conversationId}`]
      return next
    })
    set(chatDeletedConversationIdsAtom, (ids) => ({
      ...ids,
      [sessionId]: [...new Set([...(ids[sessionId] ?? []), conversationId])],
    }))
    if (get(chatSessionIdAtom) === sessionId) {
      set(chatLiveCacheAtom, (cache) => ({
        ...cache,
        conversations: cache.conversations.filter((item) => item.id !== conversationId),
        messages: cache.messages.filter((item) => item.conversationId !== conversationId),
      }))
      set(chatOptimisticMessagesAtom, (messages) =>
        messages.filter((item) => item.conversationId !== conversationId),
      )
      if (get(selectedChatIdAtom) === conversationId) set(selectedChatIdAtom, null)
      set(chatDeleteConversationIdsAtom, (ids) => ids.filter((id) => id !== conversationId))
      set(chatConversationSelectionAtom, (selection) =>
        selection?.sessionId === sessionId
          ? { ...selection, ids: selection.ids.filter((id) => id !== conversationId) }
          : selection,
      )
    }
    const client = get(queryClientAtom)
    for (const key of [
      chatKeys.messages(sessionId, conversationId),
      chatKeys.conversation(sessionId, conversationId),
    ]) {
      void client.cancelQueries({ queryKey: key })
      client.removeQueries({ queryKey: key })
    }
    const prefix = chatKeys.conversations(sessionId).slice(0, 3)
    void client.cancelQueries({ queryKey: prefix })
    client.setQueriesData<InfiniteData<Awaited<ReturnType<typeof getChatConversations>>>>(
      { queryKey: prefix },
      (previous) =>
        previous
          ? {
              ...previous,
              pages: previous.pages.map((page) => ({
                ...page,
                data: page.data.filter((item) => item.id !== conversationId),
              })),
            }
          : previous,
    )
  },
)

const retryRead = (count: number, error: Error) =>
  count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
const enabledAtom = atom(
  (get) =>
    !!get(chatSessionIdAtom) &&
    get(chatSubscribedAtom) &&
    get(chatSubscribedSessionIdAtom) === get(chatSessionIdAtom) &&
    !get(chatAccessDeniedAtom),
)

export const chatConversationPagesAtom = atomWithInfiniteQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  const q = get(chatConversationQueryAtom)
  const labelId = get(chatLabelFilterAtom)
  return {
    queryKey: chatKeys.conversations(sessionId, q, labelId),
    enabled: get(enabledAtom),
    retry: retryRead,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (pageParam !== undefined && typeof pageParam !== 'string')
        throw new Error('Cursor de conversas inválido')
      return getChatConversations(
        sessionId,
        { cursor: pageParam, q, labelId: labelId ?? undefined },
        signal,
      )
    },
    getNextPageParam: (last) =>
      last.page.hasMore ? (last.page.nextCursor ?? undefined) : undefined,
  }
})
export const chatMessagePagesAtom = atomWithInfiniteQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  const conversationId = get(selectedChatIdAtom) ?? ''
  return {
    queryKey: chatKeys.messages(sessionId, conversationId),
    enabled: get(enabledAtom) && !!conversationId,
    retry: retryRead,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (pageParam !== undefined && typeof pageParam !== 'string')
        throw new Error('Cursor de mensagens inválido')
      return getChatMessages(sessionId, conversationId, { before: pageParam }, signal)
    },
    getNextPageParam: (last) =>
      last.page.hasMore ? (last.page.nextCursor ?? undefined) : undefined,
  }
})
export const chatSelectedConversationQueryAtom = atomWithQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  const conversationId = get(selectedChatIdAtom) ?? ''
  return {
    queryKey: chatKeys.conversation(sessionId, conversationId),
    enabled: get(enabledAtom) && !!conversationId,
    retry: retryRead,
    queryFn: ({ signal }) => getChatConversation(sessionId, conversationId, signal),
  }
})

export const applyChatMessagesAtom = atom(null, (get, set, messages: MessageDTO[]) => {
  const sessionId = get(chatSessionIdAtom)
  if (!sessionId || get(chatAccessDeniedAtom)) return
  messages = messages.filter(
    (message) =>
      !(get(chatDeletedConversationIdsAtom)[sessionId] ?? []).includes(message.conversationId),
  )
  set(chatLiveCacheAtom, (cache) => ({
    ...cache,
    messages: mergeEntities(cache.messages, messages, sessionId),
  }))
  set(chatOptimisticMessagesAtom, (pending) =>
    pending.filter(
      (item) =>
        !messages.some(
          (message) =>
            message.sessionId === item.sessionId &&
            message.conversationId === item.conversationId &&
            message.clientRequestId !== null &&
            message.clientRequestId === item.clientRequestId,
        ),
    ),
  )
})
export const applyChatConversationsAtom = atom(
  null,
  (get, set, conversations: ConversationDTO[]) => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || get(chatAccessDeniedAtom)) return
    conversations = conversations.filter(
      (conversation) =>
        !(get(chatDeletedConversationIdsAtom)[sessionId] ?? []).includes(conversation.id),
    )
    set(chatLiveCacheAtom, (cache) => ({
      ...cache,
      conversations: mergeConversations(cache.conversations, conversations, sessionId),
    }))
  },
)

export const apiChatConversationsAtom = atom((get) => {
  if (get(chatAccessDeniedAtom)) return []
  const sessionId = get(chatSessionIdAtom) ?? ''
  const live = get(chatLiveCacheAtom)
  const pages = get(chatConversationPagesAtom).data?.pages.flatMap((page) => page.data) ?? []
  const selected = get(chatSelectedConversationQueryAtom).data
  const snapshots = selected ? [...pages, selected] : pages
  const conversations = mergeConversations(snapshots, live.conversations, sessionId).filter(
    (conversation) =>
      !(get(chatDeletedConversationIdsAtom)[sessionId] ?? []).includes(conversation.id),
  )
  const messages = get(chatMessagePagesAtom).data?.pages.flatMap((page) => page.data) ?? []
  const optimistic = get(chatOptimisticMessagesAtom)
  return conversations.map((conversation) => {
    const contact = live.contacts.find(
      (item) => item.id === conversation.contactId && item.sessionId === sessionId,
    )
    const confirmed = mergeMessages(messages, live.messages, sessionId, conversation.id)
    const pending = optimistic.filter(
      (item) =>
        item.sessionId === sessionId &&
        item.conversationId === conversation.id &&
        !confirmed.some(
          (message) => message.clientRequestId && message.clientRequestId === item.clientRequestId,
        ),
    )
    return {
      ...conversation,
      ...(contact && (!conversation.contact || contact.revision > conversation.contact.revision)
        ? { contact, displayName: contact.displayName, avatarUrl: contact.avatarUrl }
        : {}),
      messages: [...confirmed, ...pending].sort(
        (a, b) => a.orderAt.localeCompare(b.orderAt) || a.id.localeCompare(b.id),
      ),
    }
  })
})

// Keep empty, explicitly opened conversations available to the composer, not the sidebar.
export const visibleChatConversationsAtom = atom((get) =>
  get(apiChatConversationsAtom).filter(
    (conversation) =>
      conversation.lastMessage !== null &&
      (!get(chatLabelFilterAtom) || conversation.labelIds.includes(get(chatLabelFilterAtom) ?? '')),
  ),
)

export const chatAccessEffectAtom = atomEffect((get, set) => {
  const errors = [
    get(chatConversationPagesAtom).error,
    get(chatMessagePagesAtom).error,
    get(chatSelectedConversationQueryAtom).error,
  ]
  const error = errors.find(
    (item) => item instanceof ApiError && (item.status === 401 || item.status === 403),
  )
  if (!(error instanceof ApiError)) return
  set(chatAccessDeniedAtom, true)
  set(chatConnectionStatusAtom, error.status === 401 ? 'unauthorized' : 'forbidden')
})
