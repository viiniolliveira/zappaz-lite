import { Smile } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const EmojiPickerPanel = lazy(() => import('./emoji-picker-panel'))

interface EmojiMenuProps {
  disabled: boolean
  onOpen?: () => void
  onSelect: (emoji: string) => void
}

export default function EmojiMenu({ disabled, onOpen, onSelect }: EmojiMenuProps) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) onOpen?.()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Selecionar emoji"
              disabled={disabled}
            >
              <Smile aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Emojis</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={12}
        aria-label="Emojis"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        className="h-[min(440px,var(--radix-popover-content-available-height))] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-lg p-0"
      >
        <Suspense
          fallback={
            <p role="status" className="p-6 text-center text-sm text-muted-foreground">
              Carregando emojis…
            </p>
          }
        >
          <EmojiPickerPanel onSelect={onSelect} />
        </Suspense>
      </PopoverContent>
    </Popover>
  )
}
