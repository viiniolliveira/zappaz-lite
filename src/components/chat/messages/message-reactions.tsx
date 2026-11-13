import type { MessageDTO } from '@/lib/chat/schemas'

export default function MessageReactions({ reactions }: { reactions: MessageDTO['reactions'] }) {
  if (!reactions.length) return null
  const counts = new Map<string, number>()
  for (const { emoji } of reactions) {
    if (emoji) counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
  }
  return (
    <ul aria-label="Reações" className="mt-2 flex flex-wrap gap-1">
      {[...counts].map(([emoji, count]) => (
        <li
          key={emoji}
          className="rounded-full border bg-background px-2 py-0.5 text-xs"
          aria-label={`${emoji}: ${count} reações`}
        >
          {emoji} {count > 1 ? count : ''}
        </li>
      ))}
    </ul>
  )
}
