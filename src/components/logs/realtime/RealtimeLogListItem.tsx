import { cn } from '@/lib/utils'
import type { WebhookLog } from '@/services/types'
import LogStatus from '../LogStatus'
import { toLocalTime } from './utils'

interface RealtimeLogListItemProps {
  item: WebhookLog
  isSelected: boolean
  onSelect: (item: WebhookLog) => void
}

export function RealtimeLogListItem({ item, isSelected, onSelect }: RealtimeLogListItemProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: Selectable log contains block-level details.
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(item)
        }
      }}
      onClick={() => onSelect(item)}
      className={cn(
        'flex gap-2 p-2 text-xs hover:bg-sidebar-accent justify-between cursor-pointer items-center',
        isSelected && 'bg-sidebar-accent rounded-md',
      )}
    >
      <div className="flex flex-col gap-2 w-full">
        <div className="font-medium flex gap-1 justify-between items-center">
          <LogStatus status={item?.response?.status} />
          <div className="flex-1 ml-1 max-w-22 truncate">{item.webhookDisplayName}</div>
          <div className="text-xs text-muted-foreground">
            {toLocalTime(new Date(item.createdAt))}
          </div>
        </div>
        <div className="flex-1">Event: {item.event}</div>
      </div>
    </div>
  )
}
