import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  className?: string
}

export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-80 w-full flex-col items-center justify-center rounded-xl border bg-background px-6 py-12 text-center sm:min-h-96',
        className,
      )}
    >
      <div aria-hidden="true" className="relative mb-7 flex size-24 items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-dashed border-border/70" />
        <div className="flex size-16 items-center justify-center rounded-2xl border bg-background shadow-sm ring-4 ring-muted/50">
          <Icon className="size-7 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <span className="absolute right-0 bottom-3 size-2.5 rounded-full border-2 border-background bg-primary" />
      </div>
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
