import { useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronsUpDown, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import {
  appearanceErrorAtom,
  appearancePendingAtom,
  selectAppearanceAtom,
  selectedAppearanceAtom,
  themeCatalogAtom,
} from '@/atoms/appearance'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import type { AppearanceTheme } from '@/lib/appearance'
import { cn } from '@/lib/utils'

const modes = [
  { id: 'light', name: 'Claro', icon: Sun },
  { id: 'dark', name: 'Escuro', icon: Moon },
  { id: 'system', name: 'Sistema', icon: Monitor },
] as const

function ThemePreview({ item, dark }: { item: AppearanceTheme; dark: boolean }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-1.5" data-theme-preview={item.id}>
      {(['primary', 'secondary', 'accent', 'muted'] as const).map((token, index) => (
        <span
          key={token}
          className="size-5 rounded-full border border-background ring-1 ring-foreground/10"
          style={{ backgroundColor: item.preview[dark ? 'dark' : 'light'][index] }}
        />
      ))}
    </span>
  )
}

export default function AppearanceSettings() {
  const catalog = useAtomValue(themeCatalogAtom)
  const selected = useAtomValue(selectedAppearanceAtom)
  const pending = useAtomValue(appearancePendingAtom)
  const error = useAtomValue(appearanceErrorAtom)
  const select = useSetAtom(selectAppearanceAtom)
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const activeTheme = catalog.data?.find((item) => item.id === selected)
  return (
    <section
      aria-labelledby="appearance-title"
      className="rounded-lg border bg-background p-4 sm:p-6"
    >
      <div className="mb-6">
        <h2 id="appearance-title" className="text-lg font-semibold">
          Aparência
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize o visual. Suas escolhas ficam salvas neste navegador.
        </p>
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Modo de exibição</legend>
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {modes.map((mode) => (
            <Button
              key={mode.id}
              type="button"
              variant="outline"
              aria-pressed={theme === mode.id}
              onClick={() => setTheme(mode.id)}
              className={cn(
                'h-auto flex-col gap-2 py-4',
                theme === mode.id && 'border-primary bg-primary/5 text-primary',
              )}
            >
              <mode.icon className="size-5" aria-hidden="true" />
              {mode.name}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={pending} className="mt-6 space-y-3">
        <legend className="mb-3 text-sm font-medium">Tema</legend>
        {catalog.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando temas…
          </p>
        ) : catalog.error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-destructive">Não foi possível carregar os temas.</p>
            <Button variant="outline" onClick={() => void catalog.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                aria-label={
                  activeTheme ? `Selecionar tema: ${activeTheme.name}` : 'Selecionar tema'
                }
                className="h-12 w-full min-w-0 justify-start gap-3 px-3 sm:max-w-md"
              >
                {activeTheme && <ThemePreview item={activeTheme} dark={resolvedTheme === 'dark'} />}
                <span className="min-w-0 flex-1 truncate text-left">
                  {activeTheme?.name ?? 'Selecione um tema'}
                </span>
                <ChevronsUpDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] p-0"
            >
              <Command label="Temas">
                <CommandInput placeholder="Buscar tema…" aria-label="Buscar tema…" />
                <CommandList>
                  <CommandEmpty>Nenhum tema encontrado.</CommandEmpty>
                  <CommandGroup>
                    {catalog.data?.map((item) => (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        keywords={[item.name]}
                        aria-label={item.name}
                        aria-current={selected === item.id ? 'true' : undefined}
                        disabled={pending}
                        onSelect={async () => {
                          if (pending) return
                          await select(item)
                          setOpen(false)
                        }}
                        className="gap-3 px-3 py-3"
                      >
                        <ThemePreview item={item} dark={resolvedTheme === 'dark'} />
                        <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        {selected === item.id && (
                          <>
                            <Check aria-hidden="true" className="size-4 shrink-0" />
                            <span className="sr-only">Tema atual</span>
                          </>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </fieldset>
      {pending && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Aplicando tema…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
