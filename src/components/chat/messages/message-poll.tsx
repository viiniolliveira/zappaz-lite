import { ChartNoAxesColumnIncreasing, Check } from 'lucide-react'
import type { MessageDTO } from '@/lib/chat/schemas'
import MessageText from './message-text'

export default function MessagePoll({ poll }: { poll: MessageDTO['poll'] }) {
  if (!poll) return null
  const voters = poll.votes.filter((vote) => vote.selectedOptions.length > 0).length
  const selected = new Set(
    poll.votes.filter((vote) => vote.fromMe).flatMap((vote) => vote.selectedOptions),
  )
  return (
    <section
      data-slot="message-poll"
      aria-label="Enquete"
      className="w-72 max-w-full space-y-3 text-sm"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ChartNoAxesColumnIncreasing className="size-4" aria-hidden="true" />
        Enquete
      </div>
      <div className="font-semibold">
        <MessageText text={poll.name} />
      </div>
      <p className="text-xs text-muted-foreground">
        {poll.selectableOptionsCount === 1
          ? 'Uma opção'
          : poll.selectableOptionsCount > 1
            ? `Até ${poll.selectableOptionsCount} opções`
            : 'Múltiplas opções'}
      </p>
      <ul className="space-y-3" aria-label="Resultados recebidos">
        {poll.options.map((option) => (
          <li key={option.hash} className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-primary/50">
                {selected.has(option.hash) && (
                  <Check className="size-3 text-primary" aria-label="Sua escolha" />
                )}
              </span>
              <span className="min-w-0 flex-1 break-words">{option.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{option.votes}</span>
            </div>
            <meter
              aria-label={option.name}
              value={option.votes}
              min={0}
              max={Math.max(voters, option.votes, 1)}
              className="sr-only"
            />
            <div
              aria-hidden="true"
              className="ml-6 h-1.5 overflow-hidden rounded-full bg-foreground/10"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${voters ? Math.min(100, (option.votes / voters) * 100) : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-foreground/10 pt-2 text-xs text-muted-foreground">
        {voters} {voters === 1 ? 'participante' : 'participantes'} · Votos recebidos. Para votar,
        use o WhatsApp.
      </p>
    </section>
  )
}
