import { atom } from 'jotai'
import { atomWithQuery } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import {
  type AppearanceTheme,
  appearanceStorageKey,
  resolveAppearanceTheme,
} from '@/lib/appearance'
import { getThemeCatalog, loadThemeStylesheet } from '@/services/appearance'

export const themeCatalogAtom = atomWithQuery(() => ({
  queryKey: ['appearance', 'themes'],
  queryFn: ({ signal }) => getThemeCatalog(signal),
  staleTime: Infinity,
  retry: false,
}))
export const selectedAppearanceAtom = atom<string | null>(null)
export const appearancePendingAtom = atom(false)
export const appearanceReadyAtom = atom(false)
export const appearanceErrorAtom = atom<string | null>(null)

export const selectAppearanceAtom = atom(null, async (get, set, theme: AppearanceTheme) => {
  if (get(appearancePendingAtom)) return
  set(appearancePendingAtom, true)
  set(appearanceErrorAtom, null)
  try {
    await loadThemeStylesheet(theme)
    set(selectedAppearanceAtom, theme.id)
    try {
      localStorage.setItem(appearanceStorageKey, theme.id)
    } catch {
      toast.error('Tema aplicado, mas o navegador não permitiu salvar a preferência.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar o tema.'
    set(appearanceErrorAtom, message)
    toast.error(message)
  } finally {
    set(appearancePendingAtom, false)
  }
})

export const initializeAppearanceAtom = atom(null, async (get, set, themes: AppearanceTheme[]) => {
  if (get(appearanceReadyAtom) || get(appearancePendingAtom)) return
  let savedId: string | null = null
  try {
    savedId = localStorage.getItem(appearanceStorageKey)
  } catch {
    toast.error('O navegador não permitiu ler sua preferência de tema.')
  }
  const theme = resolveAppearanceTheme(themes, savedId)
  if (theme) await set(selectAppearanceAtom, theme)
  set(appearanceReadyAtom, true)
})
