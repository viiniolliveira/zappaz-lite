import { hasWhatsAppLink } from '@shared/whatsapp-format'
import { atom } from 'jotai'
import { atomWithMutation, queryClientAtom } from 'jotai-tanstack-query'
import { ApiError } from '@/lib/api-error'
import { chatKeys } from '@/lib/chat/merge'
import type { ChatMessage } from '@/lib/chat/types'
import { markChatRead, sendChatMedia, sendChatText } from '@/services/chat'
import {
  applyChatConversationsAtom,
  applyChatMessagesAtom,
  chatAccessDeniedAtom,
  chatConnectionStatusAtom,
  chatLiveCacheAtom,
  chatOptimisticMessagesAtom,
  chatSessionStateAtom,
} from './chat-cache'
import { mediaMaxFileSizeBytesAtom } from './media'
import { sessionKeys } from './session'
import { chatRepliesAtom, chatSessionIdAtom } from './ui'

interface SendInput {
  sessionId: string
  conversationId: string
  text: string
  clientRequestId: string
  file?: File
  voice?: boolean
  replyToMessageRecordId?: string
}
const fileKind = (file: File) =>
  file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : 'document'

export const chatSendMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'send'],
  retry: false,
  mutationFn: ({
    sessionId,
    conversationId,
    text,
    clientRequestId,
    file,
    voice,
    replyToMessageRecordId,
  }: SendInput) => {
    if (!file)
      return sendChatText(sessionId, conversationId, {
        text,
        clientRequestId,
        replyToMessageRecordId,
      })
    const body = new FormData()
    body.append('file', file)
    body.append('kind', fileKind(file))
    body.append('caption', text)
    body.append('clientRequestId', clientRequestId)
    if (voice) body.append('voice', 'true')
    if (replyToMessageRecordId) body.append('replyToMessageRecordId', replyToMessageRecordId)
    return sendChatMedia(sessionId, conversationId, body)
  },
}))

export const chatReadMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'read'],
  retry: false,
  mutationFn: ({
    sessionId,
    conversationId,
    messageId,
  }: {
    sessionId: string
    conversationId: string
    messageId: string
  }) => markChatRead(sessionId, conversationId, messageId),
}))
export const markApiChatReadAtom = atom(
  null,
  async (get, set, payload: { conversationId: string; messageId: string }) => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId) return
    const conversation = await get(chatReadMutationAtom).mutateAsync({ sessionId, ...payload })
    if (get(chatSessionIdAtom) === sessionId) set(applyChatConversationsAtom, [conversation])
  },
)

export const sendApiChatTextAtom = atom(
  null,
  async (
    get,
    set,
    payload: {
      conversationId: string
      text: string
      file?: File
      voice?: boolean
      replyTo?: ChatMessage
    },
  ): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    const sessionState = get(chatSessionStateAtom)
    const maxFileSizeBytes = payload.file ? get(mediaMaxFileSizeBytesAtom) : null
    if (
      !sessionId ||
      get(chatConnectionStatusAtom) !== 'open' ||
      !sessionState?.connected ||
      !sessionState.enabled ||
      (payload.replyTo &&
        (payload.replyTo.sessionId !== sessionId ||
          payload.replyTo.conversationId !== payload.conversationId ||
          !!payload.replyTo.deletedAt)) ||
      (!payload.file && !payload.text.trim()) ||
      payload.text.length > 4096 ||
      (payload.file && (maxFileSizeBytes === null || payload.file.size > maxFileSizeBytes))
    )
      return false
    const clientRequestId = crypto.randomUUID()
    const replyKey = `${sessionId}/${payload.conversationId}`
    const reply = payload.replyTo ?? get(chatRepliesAtom)[replyKey]
    const now = new Date().toISOString()
    const optimistic: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId,
      conversationId: payload.conversationId,
      messageId: '',
      clientRequestId,
      fromMe: true,
      sender: { jid: null, name: null },
      type: payload.file ? fileKind(payload.file) : 'text',
      text: payload.text,
      status: null,
      localStatus: 'sending',
      sentAt: null,
      orderAt: now,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      editedAt: null,
      deletedAt: null,
      media: null,
      replyTo: reply
        ? {
            messageRecordId: reply.id,
            messageId: reply.messageId,
            senderJid: reply.sender.jid,
            fromMe: reply.fromMe,
            type: reply.type,
            text: reply.text,
            contacts: reply.contacts,
            media: reply.media,
          }
        : null,
      linkPreview: null,
      hasLink: hasWhatsAppLink(payload.text),
      interactive: null,
      poll: null,
      album: null,
      groupInvite: null,
      system: null,
      unavailable: null,
      selection: null,
      location: null,
      contacts: [],
      mentions: [],
      reactions: [],
    }
    set(chatOptimisticMessagesAtom, (items) => [...items, optimistic])
    try {
      const message = await get(chatSendMutationAtom).mutateAsync({
        sessionId,
        ...payload,
        clientRequestId,
        replyToMessageRecordId: reply?.id,
      })
      if (!payload.replyTo && get(chatRepliesAtom)[replyKey]?.id === reply?.id)
        set(chatRepliesAtom, (previous) => ({ ...previous, [replyKey]: undefined }))
      if (get(chatSessionIdAtom) === sessionId) set(applyChatMessagesAtom, [message])
      void get(queryClientAtom).invalidateQueries({ queryKey: sessionKeys.history(sessionId) })
      void get(queryClientAtom).invalidateQueries({ queryKey: chatKeys.session(sessionId) })
      return true
    } catch (error) {
      if (get(chatSessionIdAtom) !== sessionId) return false
      if (
        get(chatLiveCacheAtom).messages.some(
          (message) =>
            message.sessionId === sessionId &&
            message.conversationId === payload.conversationId &&
            message.clientRequestId === clientRequestId,
        )
      )
        return true
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        set(chatConnectionStatusAtom, error.status === 401 ? 'unauthorized' : 'forbidden')
        set(chatAccessDeniedAtom, true)
        return false
      }
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500
      set(chatOptimisticMessagesAtom, (items) =>
        items.map((item) =>
          item.clientRequestId === clientRequestId
            ? { ...item, localStatus: uncertain ? 'uncertain' : 'failed' }
            : item,
        ),
      )
      if (uncertain)
        void get(queryClientAtom).invalidateQueries({ queryKey: chatKeys.session(sessionId) })
      return false
    }
  },
)
