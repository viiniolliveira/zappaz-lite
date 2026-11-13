import type { WebhookLog } from '@/services/types'
import LogStatus from '../LogStatus'
import { toLocalDateTime } from './utils'

interface RealtimeLogDetailsHeaderProps {
  log: WebhookLog | null
}

export function RealtimeLogDetailsHeader({ log }: RealtimeLogDetailsHeaderProps) {
  return (
    <div className="items-start flex flex-col gap-2 mb-4 p-3 border rounded-md">
      <div className="flex w-full items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground">
          Webhook: <span className="text-accent-foreground">{log?.webhookDisplayName || ''}</span>
        </p>
        <LogStatus status={log?.response?.status || 0} />
      </div>

      <p className="text-xs text-muted-foreground">
        Evento: <span className="text-accent-foreground">{log?.event || ''}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        Data:{' '}
        <span className="text-accent-foreground">
          {log?.createdAt ? toLocalDateTime(log.createdAt) : ''}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        Webhook ID: <span className="text-accent-foreground">{log?.webhookId || ''}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        URL destino: <span className="text-accent-foreground">{log?.url || ''}</span>
      </p>
    </div>
  )
}
