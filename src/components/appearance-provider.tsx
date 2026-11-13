import { useAtomValue, useSetAtom } from 'jotai'
import { type ReactNode, useEffect } from 'react'
import { toast } from 'sonner'
import { appearanceReadyAtom, initializeAppearanceAtom, themeCatalogAtom } from '@/atoms/appearance'
import { Spinner } from '@/components/ui/spinner'

export default function AppearanceProvider({ children }: { children: ReactNode }) {
  const catalog = useAtomValue(themeCatalogAtom)
  const ready = useAtomValue(appearanceReadyAtom)
  const initialize = useSetAtom(initializeAppearanceAtom)
  const setReady = useSetAtom(appearanceReadyAtom)
  useEffect(() => {
    if (catalog.data) void initialize(catalog.data)
    else if (catalog.error) {
      toast.error('Não foi possível carregar o catálogo de temas. Tente novamente em Minha conta.')
      setReady(true)
    }
  }, [catalog.data, catalog.error, initialize, setReady])

  // Render the interface only after the saved palette is ready, avoiding a theme flash.
  if (!ready)
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center">
        <Spinner aria-label="Carregando aparência" />
      </div>
    )
  return children
}
