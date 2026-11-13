import { request } from '@/lib/api-client'
import { type AppearanceTheme, themeCatalogSchema } from '@/lib/appearance'

export async function getThemeCatalog(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10000)
  return themeCatalogSchema.parse(
    await request<unknown>('/themes/themes.json', {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    }),
  )
}

// A pending sheet must not override the active theme before it finishes loading.
export function loadThemeStylesheet(theme: AppearanceTheme): Promise<void> {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = theme.file
    link.media = 'not all'
    const timer = window.setTimeout(() => fail(), 10000)
    const cleanup = () => {
      window.clearTimeout(timer)
      link.onload = null
      link.onerror = null
    }
    const fail = () => {
      cleanup()
      link.remove()
      reject(new Error(`Não foi possível carregar o tema ${theme.name}. Tente novamente.`))
    }
    link.onerror = fail
    link.onload = () => {
      cleanup()
      document.querySelector('link[data-appearance-theme]')?.remove()
      link.dataset.appearanceTheme = theme.id
      link.media = 'all'
      resolve()
    }
    document.head.append(link)
  })
}
