import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type RealtimeLogsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

interface RealtimeStatusBadgeProps {
  status: RealtimeLogsStatus
}

export function RealtimeStatusBadge({ status }: RealtimeStatusBadgeProps) {
  const statusConfig = {
    idle: {
      label: 'Aguardando',
      dotClassName: 'bg-gray-400',
      glowClassName: 'bg-gray-400/30',
    },
    connecting: {
      label: 'Conectando',
      dotClassName: 'bg-yellow-500',
      glowClassName: 'bg-yellow-500/30',
    },
    open: {
      label: 'Conectado',
      dotClassName: 'bg-emerald-500',
      glowClassName: 'bg-emerald-500/30',
    },
    closed: {
      label: 'Fechado',
      dotClassName: 'bg-gray-500',
      glowClassName: 'bg-gray-500/30',
    },
    error: {
      label: 'Erro',
      dotClassName: 'bg-red-500',
      glowClassName: 'bg-red-500/30',
    },
  } satisfies Record<
    RealtimeLogsStatus,
    { label: string; dotClassName: string; glowClassName: string }
  >

  const config = statusConfig[status]

  return (
    <Badge variant="outline" className="gap-2 font-normal">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span
          className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
            config.dotClassName,
          )}
        />
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', config.dotClassName)} />
      </span>
      {config.label}
    </Badge>
  )
}
