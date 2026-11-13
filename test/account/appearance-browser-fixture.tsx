import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import catalog from '../../public/themes/themes.json'
import {
  appearancePendingAtom,
  appearanceReadyAtom,
  selectedAppearanceAtom,
} from '../../src/atoms/appearance'
import AppearanceSettings from '../../src/components/account/appearance-settings'
import AppearanceProvider from '../../src/components/appearance-provider'
import { ThemeProvider } from '../../src/components/theme-provider'
import { appearanceStorageKey } from '../../src/lib/appearance'
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const results: { name: string; ok: boolean; error?: string }[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.stack : String(error) })
  }
}
async function until(fn: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  throw new Error('Timed out waiting for appearance')
}
const host = document.createElement('div')
document.body.append(host)
let root = createRoot(host)
function newStore() {
  const store = createStore()
  store.set(queryClientAtom, new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return store
}
let store = newStore()
async function mount() {
  await act(async () =>
    root.render(
      <Provider store={store}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppearanceProvider>
            <AppearanceSettings />
          </AppearanceProvider>
        </ThemeProvider>
      </Provider>,
    ),
  )
  await until(() => store.get(appearanceReadyAtom))
}
async function click(name: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === name)
  assert(button, `missing button ${name}`)
  await act(async () => button.click())
}
function trigger() {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label^="Selecionar tema"]')
  assert(button, 'missing theme trigger')
  return button
}
async function openThemes() {
  await act(async () => trigger().click())
  await until(() => !!document.querySelector('input[aria-label="Buscar tema…"]'))
}
function option(name: string) {
  return [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].find(
    (item) => item.getAttribute('aria-label') === name,
  )
}
async function selectTheme(name: string) {
  await openThemes()
  const item = option(name)
  assert(item, `missing theme option ${name}`)
  await act(async () => item.click())
  await until(() => !document.querySelector('input[aria-label="Buscar tema…"]'))
}
async function search(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar tema…"]')
  assert(input, 'missing theme search')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function key(key: string) {
  const target = document.activeElement
  assert(target, 'missing keyboard target')
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}
const primary = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
function verifyPalette(name: string, mode: 'light' | 'dark') {
  const item = catalog.find((item) => item.name === name)
  assert(item, `missing catalog item ${name}`)
  const swatches = document.querySelector(`[data-theme-preview="${item.id}"]`)?.children
  assert(swatches?.length === 4, `expected four swatches: ${name}`)
  for (let index = 0; index < 4; index++) {
    const expected = document.createElement('span')
    expected.style.backgroundColor = item.preview[mode][index]
    assert(
      (swatches[index] as HTMLElement).style.backgroundColor === expected.style.backgroundColor,
      `wrong ${mode} preview: ${name}`,
    )
  }
}
localStorage.setItem(appearanceStorageKey, 'caffeine')
localStorage.setItem('theme', 'light')
await check('startup restores saved palette before rendering account controls', async () => {
  await mount()
  assert(store.get(selectedAppearanceAtom) === 'caffeine', 'saved theme not restored')
  assert(
    document.querySelector('link[data-appearance-theme="caffeine"]'),
    'saved stylesheet not loaded',
  )
  assert(
    host.querySelector('[aria-pressed="true"]')?.textContent === 'Claro',
    'saved mode not restored',
  )
})
await check('popover search, current indicator and keyboard navigation', async () => {
  const before = store.get(selectedAppearanceAtom)
  await openThemes()
  assert(document.querySelector('[cmdk-root]'), 'missing labelled command')
  const current = option('Caffeine')
  assert(
    current?.querySelector('.sr-only')?.textContent === 'Tema atual',
    'current theme not announced',
  )
  assert(
    current?.querySelector('svg[aria-hidden="true"]'),
    'current theme check not hidden from accessibility tree',
  )
  assert(!option('Padrão')?.textContent?.includes('Tema atual'), 'other theme marked current')
  await search('cAfFeInE')
  await until(() => !!option('Caffeine') && !option('Padrão'))
  await search('nenhum-tema-existente')
  await until(() => document.body.textContent?.includes('Nenhum tema encontrado.') === true)
  await search('Padrão')
  await until(() => !!option('Padrão'))
  await key('Escape')
  await until(() => !document.querySelector('input[aria-label="Buscar tema…"]'))
  await until(() => document.activeElement === trigger())
  assert(store.get(selectedAppearanceAtom) === before, 'escape changed theme')
  await openThemes()
  await search('cAfFeInE')
  await until(() => !!option('Caffeine') && !option('Padrão'))
  await key('Enter')
  await until(() => !document.querySelector('input[aria-label="Buscar tema…"]'))
  await until(() => document.activeElement === trigger())
  assert(store.get(selectedAppearanceAtom) === 'caffeine', 'enter did not select filtered theme')
})
await check(
  'pending selection disables theme controls without changing the active theme',
  async () => {
    await openThemes()
    const before = store.get(selectedAppearanceAtom)
    await act(async () => {
      store.set(appearancePendingAtom, true)
    })
    assert(trigger().disabled, 'theme trigger remains enabled while applying')
    const item = option('Padrão')
    assert(
      item?.getAttribute('aria-disabled') === 'true',
      'theme option remains enabled while applying',
    )
    await act(async () => item.click())
    assert(store.get(selectedAppearanceAtom) === before, 'disabled option changed the theme')
    await act(async () => {
      store.set(appearancePendingAtom, false)
    })
    await key('Escape')
    await until(() => !document.querySelector('input[aria-label="Buscar tema…"]'))
  },
)
await check(
  'all catalog palettes load and dark/light mode changes their actual CSS tokens',
  async () => {
    const names = catalog.map((item) => item.name)
    for (const name of names) {
      await selectTheme(name)
      await until(() => host.querySelectorAll('fieldset:disabled').length === 0)
      assert(
        trigger().getAttribute('aria-label') === `Selecionar tema: ${name}` &&
          trigger().textContent?.includes(name),
        `theme not selected: ${name}`,
      )
      const light = primary()
      verifyPalette(name, 'light')
      await click('Escuro')
      assert(document.documentElement.classList.contains('dark'), 'dark class missing')
      verifyPalette(name, 'dark')
      assert(
        primary() === catalog.find((item) => item.name === name)?.preview.dark[0],
        `dark tokens not applied: ${name}`,
      )
      await click('Claro')
      assert(primary() === light, `light tokens not restored: ${name}`)
      assert(
        document.querySelectorAll('link[data-appearance-theme]').length === 1,
        'stylesheet accumulation',
      )
    }
    await click('Sistema')
    assert(localStorage.getItem('theme') === 'system', 'system preference not saved')
    verifyPalette(
      catalog[catalog.length - 1].name,
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    )
  },
)
await check(
  'failed CSS load keeps active stylesheet and saved preference; next selection works',
  async () => {
    const before = localStorage.getItem(appearanceStorageKey)
    await selectTheme('Indisponível')
    await until(() => !!host.querySelector('[role="alert"]'))
    assert(localStorage.getItem(appearanceStorageKey) === before, 'failure overwrote preference')
    assert(
      document
        .querySelector('link[data-appearance-theme]')
        ?.getAttribute('data-appearance-theme') === before,
      'failure removed active stylesheet',
    )
    await selectTheme('Caffeine')
    await until(() => store.get(selectedAppearanceAtom) === 'caffeine')
    assert(!host.querySelector('[role="alert"]'), 'error not cleared on retry')
  },
)
await check('remount restores preference and a removed ID returns to default', async () => {
  await act(async () => root.unmount())
  store = newStore()
  root = createRoot(host)
  await mount()
  assert(store.get(selectedAppearanceAtom) === 'caffeine', 'remount lost preference')
  await act(async () => root.unmount())
  localStorage.setItem(appearanceStorageKey, 'removed')
  store = newStore()
  root = createRoot(host)
  await mount()
  assert(store.get(selectedAppearanceAtom) === 'default', 'removed theme not reset')
  assert(
    localStorage.getItem(appearanceStorageKey) === 'default',
    'invalid preference not replaced',
  )
})
await act(async () => root.unmount())
document.body.textContent = JSON.stringify(results)
