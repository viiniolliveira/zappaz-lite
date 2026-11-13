import { useAtomValue } from 'jotai'
import { chatLabelsAtom } from '@/atoms/chat-labels'
import { cn } from '@/lib/utils'

export default function LabelBadges({
  labelIds,
  singleLine = false,
}: {
  labelIds: string[]
  singleLine?: boolean
}) {
  const { data: labels } = useAtomValue(chatLabelsAtom)
  const selected = labels?.filter((label) => labelIds.includes(label.id)) ?? []
  if (!selected.length) return null
  const visible = singleLine ? selected.slice(0, 2) : selected
  const remaining = selected.length - visible.length
  return (
    <span
      className={cn(
        'mt-1.5 flex min-w-0 items-center gap-1.5',
        singleLine ? 'flex-nowrap overflow-hidden' : 'flex-wrap',
      )}
      title={selected.map((label) => label.name).join(', ')}
    >
      {visible.map((label) => (
        <span
          key={label.id}
          title={label.description ? `${label.name}: ${label.description}` : label.name}
          style={{
            backgroundColor: `color-mix(in srgb, ${label.color} 32%, var(--background))`,
            color: `color-mix(in srgb, ${label.color} 75%, var(--foreground))`,
          }}
          className={cn(
            'inline-flex min-w-0 items-center rounded px-1.5 py-0.5 text-[10px] leading-3 font-medium tracking-wide uppercase',
            singleLine ? 'max-w-[65%] shrink' : 'max-w-full',
          )}
        >
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {remaining > 0 && (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          <span aria-hidden="true">+{remaining}</span>
          <span className="sr-only">Mais {remaining} etiquetas</span>
        </span>
      )}
    </span>
  )
}
