import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { groupChatMessages } from '@/lib/chat/group-messages'
import type { ReplyDTO } from '@/lib/chat/schemas'
import { type ChatMessage, formatMessageDay } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import MediaGallery from './media-gallery'
import MessageBubble from './message-bubble'
import TypingBubble from './typing-bubble'

interface MessageHistoryProps {
  conversationId: string
  displayName: string
  messages: ChatMessage[]
  typing?: boolean
  avatarUrl?: string | null
  loading?: boolean
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => Promise<unknown>
  scrollToBottomRequest?: number
}

export default function MessageHistory({
  conversationId,
  displayName,
  messages,
  typing = false,
  avatarUrl,
  loading,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  scrollToBottomRequest,
}: MessageHistoryProps) {
  const historyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  const nearBottom = useRef(true)
  const lastScrollTop = useRef(0)
  const [mediaSelection, setMediaSelection] = useState<{
    messageId: string
    sessionId: string
    conversationId: string
    blob: Blob | null
  } | null>(null)
  const mediaTrigger = useRef<HTMLElement | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigation = useRef(0)
  const latest = useRef({ messages, hasOlder, loadingOlder, onLoadOlder })
  useLayoutEffect(() => {
    latest.current = { messages, hasOlder, loadingOlder, onLoadOlder }
  }, [messages, hasOlder, loadingOlder, onLoadOlder])
  const firstId = messages[0]?.id
  const lastId = messages.at(-1)?.id
  const groups = groupChatMessages(messages.filter((message) => message.type !== 'album'))
  const messagesByWaId = new Map(
    messages.map((message) => [
      `${message.sessionId}/${message.conversationId}/${message.messageId}`,
      message,
    ]),
  )
  const scrollToBottom = useCallback(() => {
    const history = historyRef.current
    if (!history?.clientHeight) return
    history.scrollTop = history.scrollHeight
    lastScrollTop.current = history.scrollTop
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Changing conversations cancels pending reply navigation and highlighting.
  useEffect(
    () => () => {
      navigation.current++
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    [conversationId],
  )

  const navigateToReply = useCallback(
    async (reply: ReplyDTO) => {
      const request = ++navigation.current
      const active = () => navigation.current === request
      const findMessage = () =>
        latest.current.messages.find(
          (message) =>
            message.conversationId === conversationId &&
            (reply.messageRecordId
              ? message.id === reply.messageRecordId || message.messageId === reply.messageId
              : message.messageId === reply.messageId),
        )
      nearBottom.current = false
      while (active()) {
        const target = findMessage()
        if (target) {
          if (target.deletedAt) {
            toast.info('A mensagem citada foi removida.')
            return
          }
          const history = historyRef.current
          const element = Array.from(
            history?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [],
          ).find((item) => item.dataset.messageId === target.id)
          if (!history || !element) return
          anchor.current = null
          history.scrollTop +=
            element.getBoundingClientRect().top -
            history.getBoundingClientRect().top -
            (history.clientHeight - element.offsetHeight) / 2
          lastScrollTop.current = history.scrollTop
          nearBottom.current = false
          if (highlightTimer.current) clearTimeout(highlightTimer.current)
          setHighlightedId(target.id)
          highlightTimer.current = setTimeout(() => setHighlightedId(null), 1000)
          return
        }
        const { hasOlder: more, loadingOlder: busy, onLoadOlder: load } = latest.current
        if (!more || !load) {
          toast.info('Mensagem citada indisponível nesta conversa.')
          return
        }
        const first = latest.current.messages[0]?.id
        const history = historyRef.current
        if (!history) return
        if (!busy) {
          anchor.current = { height: history.scrollHeight, top: history.scrollTop }
          try {
            const result = await load()
            if (result && typeof result === 'object' && 'isError' in result && result.isError)
              throw new Error('Falha ao carregar mensagens')
          } catch {
            if (active()) {
              anchor.current = null
              toast.error('Não foi possível carregar a mensagem citada.')
            }
            return
          }
        }
        // Wait for the query cache to render the fetched page before looking for the target.
        let attempts = 0
        while (
          active() &&
          latest.current.messages[0]?.id === first &&
          latest.current.hasOlder &&
          attempts++ < 100
        ) {
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        if (active() && attempts >= 100) {
          anchor.current = null
          toast.error('Não foi possível carregar a mensagem citada.')
          return
        }
      }
    },
    [conversationId],
  )
  // biome-ignore lint/correctness/useExhaustiveDependencies: Conversation and initial loading transitions must reset the scroll position.
  useLayoutEffect(() => {
    nearBottom.current = true
    anchor.current = null
    scrollToBottom()
  }, [conversationId, loading, scrollToBottom])
  useLayoutEffect(() => {
    if (!scrollToBottomRequest) return
    // Sending explicitly returns to the latest message, even during older-page loading.
    nearBottom.current = true
    anchor.current = null
    scrollToBottom()
  }, [scrollToBottomRequest, scrollToBottom])
  useLayoutEffect(() => {
    const history = historyRef.current
    const content = contentRef.current
    if (!history || !content) return
    // Media can resize the history after its first render, without new messages.
    const observer = new ResizeObserver(() => {
      if (nearBottom.current && !anchor.current) scrollToBottom()
    })
    observer.observe(content)
    observer.observe(history)
    return () => observer.disconnect()
  }, [scrollToBottom])
  // biome-ignore lint/correctness/useExhaustiveDependencies: Page boundaries trigger scroll restoration after message rendering.
  useLayoutEffect(() => {
    const history = historyRef.current
    if (!history) return
    if (anchor.current) {
      if (loadingOlder) return
      history.scrollTop = anchor.current.top + history.scrollHeight - anchor.current.height
      lastScrollTop.current = history.scrollTop
      anchor.current = null
    } else if (nearBottom.current) scrollToBottom()
  }, [firstId, lastId, loadingOlder, loading, scrollToBottom])

  return (
    <section
      ref={historyRef}
      aria-label={`Histórico de ${displayName}`}
      onScroll={(event) => {
        const element = event.currentTarget
        if (!element.clientHeight) return
        // A queued automatic scroll can arrive after an image has increased scrollHeight.
        // Only a changed scroll position can detach the history from the bottom.
        if (element.scrollTop === lastScrollTop.current) return
        lastScrollTop.current = element.scrollTop
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5 pb-4 [overflow-anchor:none] md:px-6"
    >
      <div ref={contentRef}>
        {hasOlder && (
          <div className="mb-4 text-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingOlder}
              onClick={() => {
                const history = historyRef.current
                if (!history || !onLoadOlder) return
                anchor.current = { height: history.scrollHeight, top: history.scrollTop }
                nearBottom.current = false
                void onLoadOlder()
              }}
            >
              {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </Button>
          </div>
        )}
        {loading && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">
            Carregando histórico…
          </p>
        )}
        {groups.length ? (
          <ol className="flex flex-col gap-3">
            {groups.map((group, index) => {
              const message = group[0]
              const day = formatMessageDay(message.orderAt)
              const previous = groups[index - 1]?.at(-1)
              const renderMessage = (item: ChatMessage, grouped = false) => (
                <MessageBubble
                  key={item.id}
                  message={item}
                  quotedMessage={
                    item.replyTo
                      ? messagesByWaId.get(
                          `${item.sessionId}/${item.conversationId}/${item.replyTo.messageId}`,
                        )
                      : undefined
                  }
                  contactName={displayName}
                  grouped={grouped}
                  highlighted={highlightedId === item.id}
                  onNavigateReply={(reply) => {
                    void navigateToReply(reply)
                  }}
                  onOpenMedia={(messageId, blob) => {
                    mediaTrigger.current =
                      document.activeElement instanceof HTMLElement ? document.activeElement : null
                    setMediaSelection({
                      messageId,
                      sessionId: item.sessionId,
                      conversationId: item.conversationId,
                      blob,
                    })
                  }}
                  audioSender={{
                    name: item.fromMe ? 'Você' : (item.sender.name ?? displayName),
                    avatarUrl: item.fromMe ? null : (avatarUrl ?? null),
                  }}
                />
              )
              return (
                <Fragment key={message.id}>
                  {(!previous || formatMessageDay(previous.orderAt) !== day) && (
                    <li className="my-2 text-center">
                      <span className="inline-block rounded-md border bg-card px-3 py-1 text-xs text-muted-foreground">
                        {day}
                      </span>
                    </li>
                  )}
                  {group.length > 1 ? (
                    <li
                      data-slot="message-media-group"
                      className={cn('flex', message.fromMe ? 'justify-end' : 'justify-start')}
                    >
                      <ol
                        aria-label={`${group.length} imagens sem legenda em sequência`}
                        className="grid w-full max-w-[min(88%,28rem)] grid-cols-2 items-start gap-1 md:max-w-[min(85%,28rem)]"
                      >
                        {group.map((item) => renderMessage(item, true))}
                      </ol>
                    </li>
                  ) : (
                    renderMessage(message)
                  )}
                </Fragment>
              )
            })}
          </ol>
        ) : (
          !loading &&
          !typing && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Esta conversa ainda não tem mensagens. Envie a primeira.
            </p>
          )
        )}
        {typing && <TypingBubble displayName={displayName} />}
      </div>
      {mediaSelection && (
        <MediaGallery
          key={`${mediaSelection.sessionId}/${mediaSelection.conversationId}/${mediaSelection.messageId}`}
          messages={messages}
          sessionId={mediaSelection.sessionId}
          conversationId={mediaSelection.conversationId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          initialMessageId={mediaSelection.messageId}
          initialBlob={mediaSelection.blob}
          onClose={() => setMediaSelection(null)}
          onRestoreFocus={() => {
            if (mediaTrigger.current?.isConnected)
              mediaTrigger.current.focus({ preventScroll: true })
            else historyRef.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </section>
  )
}
