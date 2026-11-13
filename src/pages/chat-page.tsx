import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  apiChatConversationsAtom,
  chatAccessEffectAtom,
  chatConnectionStatusAtom,
  chatConversationPagesAtom,
  chatMessagePagesAtom,
  chatSessionStateAtom,
  visibleChatConversationsAtom,
} from '@/atoms/chat-cache'
import { markApiChatReadAtom, sendApiChatTextAtom } from '@/atoms/chat-send'
import { chatPresenceEffectAtom, realtimeChatEffectAtom } from '@/atoms/realtime-chat'
import { selectedChatIdAtom } from '@/atoms/ui'
import ChatSearchSync from '@/components/chat/chat-search-sync'
import ChatStatusToasts from '@/components/chat/chat-status-toasts'
import ConversationList from '@/components/chat/conversation-list'
import ConversationPanel from '@/components/chat/conversation-panel'
import EditMessageDialog from '@/components/chat/messages/edit-message-dialog'

export default function ChatPage() {
  const conversations = useAtomValue(apiChatConversationsAtom)
  const visibleConversations = useAtomValue(visibleChatConversationsAtom)
  const [selectedId, setSelectedId] = useAtom(selectedChatIdAtom)
  const sendApiMessage = useSetAtom(sendApiChatTextAtom)
  const markApiRead = useSetAtom(markApiChatReadAtom)
  useAtomValue(realtimeChatEffectAtom)
  useAtomValue(chatPresenceEffectAtom)
  useAtomValue(chatAccessEffectAtom)
  const status = useAtomValue(chatConnectionStatusAtom)
  const sessionState = useAtomValue(chatSessionStateAtom)
  const conversationPages = useAtomValue(chatConversationPagesAtom)
  const messagePages = useAtomValue(chatMessagePagesAtom)
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId)
  const onRead = useCallback(
    (messageId: string) => {
      if (!selectedId) return
      void markApiRead({ conversationId: selectedId, messageId }).catch((error) =>
        toast.error(error instanceof Error ? error.message : 'Não foi possível marcar leitura'),
      )
    },
    [selectedId, markApiRead],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <h1 className="sr-only">Chat</h1>
      <ChatStatusToasts />
      <ChatSearchSync />
      <EditMessageDialog conversation={selectedConversation} />
      <div ref={listRef} className="flex min-h-0 flex-1 overflow-hidden">
        <ConversationList
          conversations={visibleConversations}
          selectedId={selectedId}
          hasMore={conversationPages.hasNextPage}
          loadingMore={conversationPages.isFetchingNextPage}
          loading={conversationPages.isPending && conversationPages.isEnabled}
          onLoadMore={() => {
            void conversationPages.fetchNextPage()
          }}
          onSelect={(id) => {
            setSelectedId(id)
            setAnnouncement('')
          }}
        />
        <ConversationPanel
          conversation={selectedConversation}
          sendDisabled={status !== 'open' || !sessionState?.connected || !sessionState.enabled}
          loading={messagePages.isPending}
          hasOlder={messagePages.hasNextPage}
          loadingOlder={messagePages.isFetchingNextPage}
          onLoadOlder={() => messagePages.fetchNextPage()}
          onRead={onRead}
          onBack={() => {
            const selectedButton = listRef.current?.querySelector<HTMLButtonElement>(
              'button[aria-current="true"]',
            )
            setSelectedId(null)
            requestAnimationFrame(() => selectedButton?.focus())
          }}
          onSend={async (text, file, voice) => {
            if (!selectedId) return false
            const sent = await sendApiMessage({ conversationId: selectedId, text, file, voice })
            setAnnouncement(
              sent
                ? 'Mensagem aceita para envio'
                : 'Envio não confirmado. Confira o histórico antes de reenviar.',
            )
            return sent
          }}
        />
      </div>
      <p role="status" className="sr-only top-0 left-0">
        {announcement}
      </p>
    </div>
  )
}
