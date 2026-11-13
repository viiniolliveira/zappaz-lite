import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react'
import type { ChatMessage } from '@/lib/chat/types'
import { formatMessageTime } from '@/lib/chat/types'
import { cn } from '@/lib/utils'

const statuses = {
  error: { Icon: AlertCircle, label: 'Erro de envio' },
  pending: { Icon: Clock, label: 'Aguardando confirmação' },
  sent: { Icon: Check, label: 'Enviada' },
  delivered: { Icon: CheckCheck, label: 'Entregue' },
  read: { Icon: CheckCheck, label: 'Lida' },
  played: { Icon: CheckCheck, label: 'Reproduzida' },
}

export default function MessageMetadata({
  message,
  standalone = false,
  overlay = false,
}: {
  message: ChatMessage
  standalone?: boolean
  overlay?: boolean
}) {
  const status = message.fromMe && message.status ? statuses[message.status] : null
  const localLabel =
    message.localStatus &&
    {
      sending: 'Enviando…',
      failed: 'Falha no envio',
      uncertain: 'Resultado incerto. Consulte o histórico antes de reenviar.',
    }[message.localStatus]
  return (
    <div
      data-slot="message-metadata"
      className={cn(
        'mt-1 flex flex-wrap items-center justify-end gap-1.5 text-xs text-muted-foreground',
        standalone && 'ml-auto w-fit rounded-full bg-muted/80 px-2 py-1',
        overlay &&
          'pointer-events-none absolute inset-x-0 bottom-0 mt-0 rounded-b-md bg-linear-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-white [&>svg]:shrink-0',
      )}
    >
      {message.editedAt && !message.deletedAt && <span>Editada</span>}
      <time
        dateTime={message.orderAt}
        title={message.sentAt ? undefined : 'Horário de recebimento local'}
      >
        {formatMessageTime(message.sentAt ?? message.orderAt)}
      </time>
      {localLabel ? (
        <span role="status">{localLabel}</span>
      ) : (
        status && <status.Icon className="size-3.5" aria-label={status.label} />
      )}
    </div>
  )
}
