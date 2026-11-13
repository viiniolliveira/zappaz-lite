import type { WebhookLog } from '@/services/types'
import { RealtimeEmptyState } from './RealtimeEmptyState'
import RealtimeLogBody from './RealtimeLogBody'
import { RealtimeLogDetailsHeader } from './RealtimeLogDetailsHeader'

interface RealtimeLogDetailsProps {
  logsCount: number
  selectedLog: WebhookLog | null
}

export function RealtimeLogDetails({ logsCount, selectedLog }: RealtimeLogDetailsProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col">
      {logsCount === 0 ? (
        <RealtimeEmptyState />
      ) : (
        <>
          <RealtimeLogDetailsHeader log={selectedLog} />
          <RealtimeLogBody payload={selectedLog?.payload} response={selectedLog?.response} />
        </>
      )}
    </div>
  )
}
