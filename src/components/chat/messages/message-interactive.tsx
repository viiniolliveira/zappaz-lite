import { useSetAtom } from 'jotai'
import { ExternalLink, Reply } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { sendApiChatTextAtom } from '@/atoms/chat-send'
import { Button } from '@/components/ui/button'
import type { MessageDTO } from '@/lib/chat/schemas'
import MessageList from './message-list'
import MessagePayment from './message-payment'
import MessageText from './message-text'

export default function MessageInteractive({
  message,
  children,
  metadata,
}: {
  message: MessageDTO
  children: ReactNode
  metadata?: ReactNode
}) {
  const send = useSetAtom(sendApiChatTextAtom)
  const [sending, setSending] = useState(false)
  const interactive = message.interactive
  if (!interactive) return children

  async function reply(text: string) {
    if (sending) return
    setSending(true)
    try {
      const sent = await send({ conversationId: message.conversationId, text, replyTo: message })
      if (!sent) toast.error('Não foi possível enviar a resposta. Verifique a conexão da sessão.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a resposta.')
    } finally {
      setSending(false)
    }
  }

  const actions = (
    <>
      {interactive.buttons.length > 0 && (
        <fieldset
          className="flex flex-col divide-y divide-foreground/10 border-t border-foreground/10"
          aria-label="Opções da mensagem"
        >
          {interactive.buttons.map((button) => {
            const classes =
              'h-auto min-h-9 w-full whitespace-normal rounded-none [overflow-wrap:anywhere]'
            return button.kind === 'url' && button.url ? (
              <Button
                key={`${button.id}-${button.url}-${button.text}`}
                variant="ghost"
                className={classes}
                asChild
              >
                <a href={button.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  {button.text}
                </a>
              </Button>
            ) : (
              <Button
                key={`${button.id}-${button.url}-${button.text}`}
                type="button"
                variant="ghost"
                className={classes}
                disabled={
                  sending || button.kind !== 'reply' || !button.text.trim() || !!message.deletedAt
                }
                onClick={() => void reply(button.text)}
                title={button.kind === 'unsupported' ? 'Ação ainda não suportada' : undefined}
                aria-busy={sending}
              >
                {button.kind === 'reply' && (
                  <Reply className="size-4 shrink-0" aria-hidden="true" />
                )}
                {button.text}
              </Button>
            )
          })}
        </fieldset>
      )}
      {interactive.list && (
        <MessageList
          list={interactive.list}
          disabled={sending || !!message.deletedAt || message.fromMe}
          onSelect={(text) => void reply(text)}
        />
      )}
    </>
  )

  if (interactive.payment) {
    return (
      <MessagePayment
        payment={interactive.payment}
        footer={interactive.footer}
        metadata={metadata}
        actions={actions}
        disabled={!!message.deletedAt}
      >
        {interactive.title && (
          <div className="font-semibold">
            <MessageText text={interactive.title} />
          </div>
        )}
        {children}
      </MessagePayment>
    )
  }

  return (
    <div
      data-slot="message-interactive"
      className="w-72 max-w-full space-y-2 overflow-hidden rounded-lg bg-foreground/5 text-sm"
    >
      {interactive.title && (
        <div className="px-2 pt-1 font-semibold">
          <MessageText text={interactive.title} />
        </div>
      )}
      <div className={message.media ? '' : 'px-2.5 pt-2.5'}>{children}</div>
      {interactive.footer && (
        <p className="whitespace-pre-wrap break-words px-2 text-xs text-muted-foreground">
          {interactive.footer}
        </p>
      )}
      {metadata && <div className="px-2.5 pb-1.5">{metadata}</div>}
      {actions}
    </div>
  )
}
