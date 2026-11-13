'use client'

import { useAtom } from 'jotai'
import { RotateCcw } from 'lucide-react'
import { retryWebhookEventAtom } from '@/atoms/webhook'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import type { WebhookLog } from '@/services/types'
import { Button } from '../ui/button'
import RealtimeLogBody from './realtime/RealtimeLogBody'
import { RealtimeLogDetailsHeader } from './realtime/RealtimeLogDetailsHeader'
import { useResizableDrawer } from './realtime/useResizableDrawer'

interface LogsDetailProps {
  log: WebhookLog | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function LogsDetail({ log, open, onOpenChange }: LogsDetailProps) {
  const [{ mutate: retryWebhookEvent, isPending }] = useAtom(retryWebhookEventAtom)
  const { height, onResizeStart } = useResizableDrawer()

  function handleRetry() {
    if (!log?.sessionId) return

    retryWebhookEvent({
      sessionId: log.sessionId,
      webhookId: log.webhookId,
      logId: log.id,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom" handleOnly={true}>
      <DrawerContent
        aria-describedby="drawer-description"
        className={cn('sm:min-w-120 min-w-full')}
        style={{ height: `${height}px`, maxHeight: '100vh' }}
      >
        <DrawerHeader className="cursor-row-resize px-4 py-0" onMouseDown={onResizeStart}>
          <div className="flex items-center justify-between gap-3 px-2 h-10 rounded-md">
            <div className="flex items-center gap-3">
              <p>Detalhes do Log</p>
            </div>
            <Button
              onMouseDown={(event) => event.stopPropagation()}
              onClick={handleRetry}
              size="xs"
              variant="default"
              disabled={isPending || !log?.sessionId}
            >
              <RotateCcw className="h-4 w-4" />
              {isPending ? 'Enviando...' : 'Reenviar'}
            </Button>
          </div>
        </DrawerHeader>
        <DrawerTitle className="hidden justify-between items-center">
          <span>Detalhes do Log</span>
        </DrawerTitle>

        <div className="p-4 flex-1 min-h-0 flex gap-2">
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <RealtimeLogDetailsHeader log={log} />
            <RealtimeLogBody payload={log?.payload ?? {}} response={log?.response ?? {}} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
