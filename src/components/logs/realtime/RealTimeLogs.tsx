'use client'

import { useAtom } from 'jotai'
import { RotateCcw } from 'lucide-react'
import {
  realtimeLogsEffectAtom,
  realtimeLogsStatusAtom,
  selectedLogAtom,
  webhookLogsAtom,
} from '@/atoms/realtime-logs'
import { retryWebhookEventAtom } from '@/atoms/webhook'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { RealtimeLogDetails } from './RealtimeLogDetails'
import { RealtimeLogList } from './RealtimeLogList'
import { RealtimeStatusBadge } from './RealtimeStatusBadge'
import { useResizableDrawer } from './useResizableDrawer'

interface RealTimeLogsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function RealTimeLogs({ open, onOpenChange }: RealTimeLogsProps) {
  const [selectedLog, setSelectedLog] = useAtom(selectedLogAtom)
  const [webhookLogs] = useAtom(webhookLogsAtom)
  const [realtimeLogsStatus] = useAtom(realtimeLogsStatusAtom)
  const [{ mutate: retryWebhookEvent, isPending }] = useAtom(retryWebhookEventAtom)

  useAtom(realtimeLogsEffectAtom)

  const { height, onResizeStart } = useResizableDrawer()

  function handleRetry() {
    if (!selectedLog?.sessionId) return

    retryWebhookEvent({
      sessionId: selectedLog.sessionId,
      webhookId: selectedLog.webhookId,
      logId: selectedLog.id,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" handleOnly={true}>
      <DrawerContent
        aria-describedby="drawer-description"
        className={cn('sm:min-w-120 min-w-full')}
        style={{ height: `${height}px`, maxHeight: '100vh' }}
      >
        <DrawerHeader className="cursor-s-resize px-4 py-1" onMouseDown={onResizeStart}>
          <div className="flex items-center justify-between gap-3 px-2 h-10 rounded-md">
            <div className="flex items-center gap-3">
              <p>Logs em tempo real</p>
              <RealtimeStatusBadge status={realtimeLogsStatus} />
            </div>
            <Button
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleRetry}
              size="xs"
              variant="default"
              disabled={isPending || !selectedLog?.sessionId}
            >
              <RotateCcw className="h-4 w-4" />
              {isPending ? 'Enviando...' : 'Reenviar'}
            </Button>
          </div>
        </DrawerHeader>
        <DrawerTitle className="hidden justify-between items-center">
          <span>Detalhes do Log</span>
        </DrawerTitle>

        <div className="flex min-h-0 w-full flex-1 gap-2 p-4">
          <RealtimeLogList
            logs={webhookLogs}
            selectedLogId={selectedLog?.id}
            onSelectLog={setSelectedLog}
          />
          <RealtimeLogDetails logsCount={webhookLogs.length} selectedLog={selectedLog} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}
