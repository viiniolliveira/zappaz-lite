import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { chatTypingAtom } from '@/atoms/chat-typing'
import { chatContactFormAtom, chatContactPanelAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import { type ChatConversation, contactInitials } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import AttachmentWorkspace from './attachment-workspace'
import ContactAvatar from './contact-avatar'
import ContactDetailsPanel from './contact-details-panel'
import LabelMenu from './label-menu'
import MessageHistory from './message-history'

interface ConversationPanelProps {
  conversation: ChatConversation | undefined
  sendDisabled?: boolean
  loading?: boolean
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => Promise<unknown>
  onRead?: (messageId: string) => void
  onBack: () => void
  onSend: (text: string, file?: File, voice?: boolean) => boolean | Promise<boolean>
}

type ReadCursor = { id: string; orderAt: string }
const compareReadCursor = (a: ReadCursor, b: ReadCursor) =>
  a.orderAt.localeCompare(b.orderAt) || a.id.localeCompare(b.id)

export default function ConversationPanel({
  conversation,
  sendDisabled,
  loading,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onRead,
  onBack,
  onSend,
}: ConversationPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const contactTrigger = useRef<HTMLButtonElement>(null)
  const [contactPanel, setContactPanel] = useAtom(chatContactPanelAtom)
  const setContactForm = useSetAtom(chatContactFormAtom)
  const conversationId = conversation?.id
  const conversationKey = conversation ? `${conversation.sessionId}/${conversation.id}` : null
  const typing = useAtomValue(chatTypingAtom)
  const contactPanelOpen =
    !!conversation &&
    contactPanel?.sessionId === conversation.sessionId &&
    contactPanel.conversationId === conversation.id
  const contactId = conversation?.contactId
  useEffect(
    () => () => {
      setContactPanel((current) =>
        current && `${current.sessionId}/${current.conversationId}` === conversationKey
          ? null
          : current,
      )
      setContactForm((current) =>
        current?.surface === 'panel' && current.contactId === contactId ? null : current,
      )
    },
    [conversationKey, contactId, setContactPanel, setContactForm],
  )
  const [scrollRequest, setScrollRequest] = useState<{ key: string; version: number } | null>(null)
  const readOpeningRef = useRef<{
    key: string
    initialized: boolean
    cursor: ReadCursor | null
  } | null>(null)
  useEffect(() => {
    if (conversationId && !contactPanelOpen) headingRef.current?.focus({ preventScroll: true })
  }, [conversationId, contactPanelOpen])
  useEffect(() => {
    if (!conversation) {
      readOpeningRef.current = null
      return
    }
    const key = `${conversation.sessionId}/${conversation.id}`
    if (readOpeningRef.current?.key !== key)
      readOpeningRef.current = { key, initialized: false, cursor: null }
    const reportRead = () => {
      const opening = readOpeningRef.current
      if (
        !opening ||
        opening.key !== key ||
        loading ||
        !onRead ||
        document.visibilityState !== 'visible'
      )
        return
      const last = conversation.messages.findLast((message) => !message.localStatus)
      if (!last) return
      const cursor = { id: last.id, orderAt: last.orderAt }
      if (!opening.initialized) {
        opening.initialized = true
        if (conversation.unreadCount === 0) {
          opening.cursor = cursor
          return
        }
      }
      if (
        conversation.unreadCount === 0 ||
        (opening.cursor && compareReadCursor(cursor, opening.cursor) <= 0)
      )
        return
      const alreadyRead = conversation.messages.find(
        (message) => message.id === conversation.lastReadMessageRecordId,
      )
      if (alreadyRead && compareReadCursor(cursor, alreadyRead) <= 0) {
        opening.cursor = alreadyRead
        return
      }
      // Scroll, reactions and receipts cannot advance this cursor.
      opening.cursor = cursor
      onRead(cursor.id)
    }
    reportRead()
    document.addEventListener('visibilitychange', reportRead)
    return () => document.removeEventListener('visibilitychange', reportRead)
  }, [conversation, loading, onRead])
  return (
    <section
      aria-label="Conversa selecionada"
      className={cn(
        'min-h-0 min-w-0 flex-1 bg-background',
        conversation ? 'flex' : 'hidden md:flex',
      )}
    >
      {conversation ? (
        <>
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              contactPanelOpen && 'hidden xl:flex',
            )}
          >
            <header className="flex h-18 shrink-0 items-center gap-3 border-b bg-background px-3 md:px-5">
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Voltar para conversas"
                onClick={onBack}
                className="md:hidden"
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
              <button
                ref={contactTrigger}
                type="button"
                aria-label={`Informações de ${conversation.displayName}`}
                aria-expanded={contactPanelOpen}
                onClick={() =>
                  setContactPanel({
                    sessionId: conversation.sessionId,
                    conversationId: conversation.id,
                    mediaMessageId: null,
                  })
                }
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ContactAvatar
                  initials={contactInitials(conversation.displayName)}
                  avatarUrl={conversation.avatarUrl}
                  className="size-10 shrink-0"
                />
                <div className="min-w-0">
                  <h2
                    ref={headingRef}
                    tabIndex={-1}
                    className="truncate text-sm font-semibold outline-none"
                  >
                    {conversation.displayName}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {conversation.contact?.phoneNumber ?? conversation.jid}
                  </p>
                </div>
              </button>
              <LabelMenu conversation={conversation} />
            </header>
            <AttachmentWorkspace
              key={`${conversation.sessionId}/${conversation.id}`}
              draftKey={`${conversation.sessionId}/${conversation.id}`}
              disabled={sendDisabled}
              onSend={async (text, file, voice) => {
                const sent = await onSend(text, file, voice)
                if (sent && conversationKey)
                  setScrollRequest((previous) => ({
                    key: conversationKey,
                    version: (previous?.version ?? 0) + 1,
                  }))
                return sent
              }}
            >
              <MessageHistory
                key={`history/${conversation.sessionId}/${conversation.id}`}
                conversationId={conversation.id}
                displayName={conversation.displayName}
                avatarUrl={conversation.avatarUrl}
                messages={conversation.messages}
                typing={!!typing[`${conversation.sessionId}/${conversation.id}`]}
                loading={loading}
                hasOlder={hasOlder}
                loadingOlder={loadingOlder}
                onLoadOlder={onLoadOlder}
                scrollToBottomRequest={
                  scrollRequest?.key === conversationKey ? scrollRequest?.version : 0
                }
              />
            </AttachmentWorkspace>
          </div>
          {contactPanelOpen && (
            <ContactDetailsPanel
              key={conversationKey}
              conversation={conversation}
              onClose={() => {
                setContactPanel(null)
                setContactForm((current) => (current?.surface === 'panel' ? null : current))
                requestAnimationFrame(() => contactTrigger.current?.focus({ preventScroll: true }))
              }}
            />
          )}
        </>
      ) : (
        <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-center px-8 text-center">
          <MessageCircle
            aria-hidden="true"
            className="mb-5 size-12 stroke-1 text-muted-foreground"
          />
          <h2 className="text-xl font-semibold tracking-tight">Suas conversas, em um só lugar</h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Selecione um contato para ver o histórico.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Selecione uma sessão para acessar suas conversas do WhatsApp.
          </p>
        </div>
      )}
    </section>
  )
}
