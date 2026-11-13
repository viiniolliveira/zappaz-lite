import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function MessageFrame({
  id,
  fromMe,
  sticker = false,
  compactMedia = false,
  grouped = false,
  highlighted = false,
  children,
}: {
  id: string
  fromMe: boolean
  sticker?: boolean
  compactMedia?: boolean
  grouped?: boolean
  highlighted?: boolean
  children: ReactNode
}) {
  return (
    <li
      data-message-id={id}
      className={cn(
        'flex min-w-0 rounded-xl transition-colors duration-500',
        highlighted && 'bg-primary/20',
        fromMe ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'group/message relative min-w-0',
          grouped ? 'w-full' : 'max-w-[88%] md:max-w-[85%]',
          !sticker && [
            'rounded-xl',
            compactMedia ? 'p-1' : 'px-3.5 py-2.5',
            fromMe ? 'rounded-tr-sm bg-primary/15' : 'rounded-tl-sm border bg-card',
          ],
        )}
      >
        <span className="sr-only">{fromMe ? 'Você: ' : 'Contato: '}</span>
        {children}
      </div>
    </li>
  )
}
