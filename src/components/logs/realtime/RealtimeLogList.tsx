import { AnimatePresence, motion } from 'motion/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { WebhookLog } from '@/services/types'
import { RealtimeLogListItem } from './RealtimeLogListItem'

interface RealtimeLogListProps {
  logs: WebhookLog[]
  selectedLogId?: string
  onSelectLog: (log: WebhookLog) => void
}

export function RealtimeLogList({ logs, selectedLogId, onSelectLog }: RealtimeLogListProps) {
  return (
    <div className="w-64 shrink-0 min-h-0 border rounded-md">
      <ScrollArea className="h-full w-full rounded-md">
        <div className="p-2">
          <AnimatePresence initial={false}>
            {logs.map((log) => (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, x: -24, y: 0 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ delay: 0, duration: 0.4, ease: 'easeOut' }}
              >
                <RealtimeLogListItem
                  item={log}
                  isSelected={selectedLogId === log.id}
                  onSelect={onSelectLog}
                />
                <Separator className="my-2" />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  )
}
