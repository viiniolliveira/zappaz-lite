import { LockKeyhole, Timer, Unplug } from 'lucide-react'
import type { MessageDTO } from '@/lib/chat/schemas'

export default function MessageNotice({ message }: { message: MessageDTO }) {
  const Icon =
    message.type === 'unavailable'
      ? Unplug
      : message.system?.kind === 'block_contact'
        ? LockKeyhole
        : Timer
  const duration = message.system?.duration
  const days = duration != null && duration > 0 ? duration / 86400 : null
  return (
    <div data-slot="message-notice" className="flex max-w-72 items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p>{message.text}</p>
        {days != null && (
          <p className="text-xs text-muted-foreground">
            As novas mensagens desaparecem após{' '}
            {Number.isInteger(days)
              ? `${days} ${days === 1 ? 'dia' : 'dias'}`
              : `${duration} segundos`}
            .
          </p>
        )}
      </div>
    </div>
  )
}
