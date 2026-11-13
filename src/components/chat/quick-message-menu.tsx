import { Zap } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'
import type { QuickMessage } from '@/lib/chat/quick-messages'

export default function QuickMessageMenu({
  items,
  selected,
  onSelect,
  onHighlight,
  loading,
  error,
  onRetry,
  onActiveItemChange,
}: {
  items: QuickMessage[]
  selected: string
  onSelect: (item: QuickMessage) => void
  onHighlight: (id: string) => void
  loading: boolean
  error: Error | null
  onRetry: () => void
  onActiveItemChange: (listId: string, optionId: string | undefined) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const item = root.current?.querySelector(`[data-value="${CSS.escape(selected)}"]`)
    item?.scrollIntoView({ block: 'nearest' })
    const list = root.current?.querySelector('[cmdk-list]')
    if (list) onActiveItemChange(list.id, item?.id)
  }, [selected, onActiveItemChange])
  return (
    <div className="absolute inset-x-3 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border bg-popover shadow-lg md:inset-x-4">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2 font-medium">
          <Zap aria-hidden="true" className="size-3.5" />
          Mensagens rápidas
        </span>
        <span>↑ ↓ selecionar · Enter inserir · Esc fechar</span>
      </div>
      <Command
        ref={root}
        shouldFilter={false}
        value={selected}
        onValueChange={onHighlight}
        className="rounded-none"
      >
        <CommandList aria-label="Mensagens rápidas" className="max-h-[min(40dvh,20rem)] p-1.5">
          {loading ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">
              Carregando mensagens rápidas…
            </p>
          ) : error ? (
            <div role="alert" className="space-y-2 p-4 text-sm">
              <p className="text-destructive">{error.message}</p>
              <Button
                type="button"
                variant="outline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRetry}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <CommandEmpty>Nenhuma mensagem rápida encontrada.</CommandEmpty>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onSelect={() => onSelect(item)}
                  className="cursor-pointer gap-3 rounded-xl px-3 py-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Zap aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-primary">/{item.command}</span>
                      <span className="truncate font-medium">{item.name}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                  </div>
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
      </Command>
    </div>
  )
}
