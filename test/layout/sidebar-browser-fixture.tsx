import { QueryClient } from '@tanstack/react-query'
import { Provider, createStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { ThemeProvider } from 'next-themes'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router'
import { authKeys } from '../../src/atoms/auth-keys'
import { sessionKeys } from '../../src/atoms/session'
import { selectedChatIdAtom } from '../../src/atoms/ui'
import { DashboardLayout } from '../../src/layouts/dashboard-layout'

const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
client.setQueryData(sessionKeys.list(), [])
client.setQueryData(authKeys.user(), { role: 'USER' })
store.set(queryClientAtom, client)
window.fetch = () => Promise.reject(new Error('Unexpected network request'))
const wait = async (predicate: () => boolean, label: string) => {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(label)
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const checkChatDivider = (state: string) => {
  const container = document.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!
  const gap = document.querySelector<HTMLElement>('[data-slot="sidebar-gap"]')!
  const main = document.querySelector<HTMLElement>('#main-content')!
  const style = getComputedStyle(container)
  const mainStyle = getComputedStyle(main)
  const containerRect = container.getBoundingClientRect()
  const gapRect = gap.getBoundingClientRect()
  const mainRect = main.getBoundingClientRect()
  check(style.borderRightWidth === '1px' && style.borderRightStyle === 'solid', `${state}: sidebar divider must be 1px solid`)
  check(style.borderRightColor !== 'rgba(0, 0, 0, 0)' && style.borderRightColor !== 'transparent', `${state}: sidebar divider must be visible`)
  check(style.borderRightColor === mainStyle.borderLeftColor, `${state}: divider must use the theme border color`)
  check(mainStyle.borderLeftWidth === '0px', `${state}: main must not duplicate the divider`)
  check(Math.abs(containerRect.width - gapRect.width) < 0.5, `${state}: sidebar container and gap widths differ (${containerRect.width}, ${gapRect.width})`)
  check(Math.abs(containerRect.right - mainRect.left) < 0.5, `${state}: divider and main are not aligned (${containerRect.right}, ${mainRect.left})`)
  return style.borderRightColor
}
const checkFooterStyle = async () => {
  await wait(() => !!button('Ativar tema escuro'), 'theme button missing')
  const reference = document.querySelector<HTMLElement>('a[aria-label="Logs"]')!
  const referenceStyle = getComputedStyle(reference)
  for (const label of ['Ativar tema escuro', 'Deslogar']) {
    const control = button(label)!
    const style = getComputedStyle(control)
    for (const property of ['height', 'padding-left', 'border-radius', 'background-color', 'box-shadow', 'color']) {
      check(style.getPropertyValue(property) === referenceStyle.getPropertyValue(property), `${label}: ${property} differs from menu`)
    }
    check(control.querySelector('svg')!.getBoundingClientRect().width === reference.querySelector('svg')!.getBoundingClientRect().width, `${label}: icon size differs from menu`)
    const left = control.getBoundingClientRect().left
    // The footer has an additional p-2 container around the same group and menu padding.
    const expectedLeft = reference.getBoundingClientRect().left + 8
    check(Math.abs(left - expectedLeft) <= 1, `${label}: alignment differs from menu (expected ${expectedLeft}, got ${left})`)
  }
}
const root = createRoot(document.getElementById('root')!)

async function run() {
  const isDefault = location.hash === '#layout-default'
  const route = isDefault ? '/sessions' : '/chat'
  if (location.hash === '#screenshot-collapsed-dark') localStorage.setItem('theme', 'dark')
  root.render(<Provider store={store}><ThemeProvider defaultTheme="light" attribute="class"><MemoryRouter initialEntries={[route]}><Routes><Route element={<DashboardLayout />}><Route path="/chat" element={<p>Chat fixture</p>} /><Route path="/sessions" element={<p>Sessions fixture</p>} /></Route></Routes></MemoryRouter></ThemeProvider></Provider>)
  if (location.hash === '#layout-chat-focus') {
    const mobile = innerWidth < 768
    await wait(() => !!button(mobile ? 'Abrir menu' : 'Recolher menu'), 'navigation trigger missing')
    const content = document.querySelector('#main-content > div:last-child')!
    const listTop = content.getBoundingClientRect().top
    store.set(selectedChatIdAtom, 'conversation')
    if (mobile) {
      await wait(() => getComputedStyle(button('Abrir menu')!.parentElement!).display === 'none', 'mobile menu must hide in an open conversation')
      check(content.getBoundingClientRect().top < listTop, 'conversation must reclaim the menu space')
      store.set(selectedChatIdAtom, null)
      await wait(() => getComputedStyle(button('Abrir menu')!.parentElement!).display !== 'none', 'mobile menu must return after closing the conversation')
      check(content.getBoundingClientRect().top === listTop, 'list layout must be restored')
    } else {
      await new Promise(resolve => requestAnimationFrame(resolve))
      check(document.querySelector('[data-slot="sidebar"][data-state]')!.getBoundingClientRect().width > 0, 'desktop navigation must remain visible in a conversation')
      check(content.getBoundingClientRect().top === listTop, 'desktop conversation layout must not change')
    }
    root.unmount()
    document.body.textContent = 'ok'
    return
  }
  if (location.hash.startsWith('#screenshot-')) {
    const mobile = innerWidth < 768
    await wait(() => !!button(mobile ? 'Abrir menu' : 'Recolher menu'), 'screenshot trigger missing')
    if (mobile || location.hash.startsWith('#screenshot-collapsed')) {
      button(mobile ? 'Abrir menu' : 'Recolher menu')!.click()
      await wait(() => mobile ? !!document.querySelector('[role="dialog"]') : document.querySelector('[data-collapsible="icon"]') !== null, 'screenshot state missing')
    }
    document.body.dataset.ready = 'true'
    return
  }
  if (innerWidth < 768) {
    check(innerWidth === 390, `expected 390px mobile viewport, got ${innerWidth}`)
    await wait(() => !!button('Abrir menu'), 'mobile open trigger missing')
    check(!document.querySelector('[role="dialog"]'), 'drawer must start closed')
    button('Abrir menu')!.click()
    await wait(() => !!document.querySelector('[role="dialog"]'), 'mobile drawer did not open')
    const dialog = document.querySelector('[role="dialog"]')!
    check(!!dialog.querySelector('a[aria-label="Chat"][aria-current="page"]'), 'mobile active Chat link missing')
    check(button('Fechar menu')?.getAttribute('aria-expanded') === 'true', 'mobile trigger must indicate open')
    await checkFooterStyle()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wait(() => !document.querySelector('[role="dialog"]'), 'mobile drawer did not close with Escape')
    check(button('Abrir menu')?.getAttribute('aria-expanded') === 'false', 'mobile trigger must indicate closed')
    button('Abrir menu')!.click()
    await wait(() => !!document.querySelector('[role="dialog"]'), 'mobile drawer did not reopen')
  } else {
    await wait(() => !!button('Recolher menu'), 'desktop collapse trigger missing')
    const sidebar = () => document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]')
    check(sidebar()?.dataset.state === 'expanded', 'sidebar must start expanded')
    check(button('Recolher menu')?.getAttribute('aria-expanded') === 'true', 'expanded trigger aria-expanded')
    await checkFooterStyle()
    const lightDivider = isDefault ? '' : checkChatDivider('expanded light')
    button('Recolher menu')!.click()
    await wait(() => sidebar()?.dataset.collapsible === 'icon', 'sidebar did not collapse to icons')
    check(button('Expandir menu')?.getAttribute('aria-expanded') === 'false', 'collapsed trigger aria-expanded')
    // Wait for the sidebar width transition before measuring its rendered geometry.
    await new Promise(resolve => setTimeout(resolve, 300))
    if (!isDefault) check(checkChatDivider('collapsed light') === lightDivider, 'light divider color changed on collapse')
    const bar = sidebar()!
    const controls = [...bar.querySelectorAll<HTMLElement>('[data-sidebar="trigger"], [data-sidebar="menu-button"]')]
    check(controls.length === 11, `expected eleven compact controls, got ${controls.length}`)
    const centerX = (element: Element) => { const rect = element.getBoundingClientRect(); return rect.left + rect.width / 2 }
    const expectedCenter = centerX(controls[0])
    for (const control of controls) {
      const name = control.getAttribute('aria-label') ?? control.textContent
      const icon = control.querySelector('svg')
      check(icon, `${name}: icon missing`)
      check(Math.abs(centerX(control) - expectedCenter) <= 1, `${name}: control is not aligned with trigger (expected ${expectedCenter}, got ${centerX(control)})`)
      check(Math.abs(centerX(icon!) - centerX(control)) <= 1, `${name}: icon is not centered in its control`)
      check(control.scrollWidth <= control.clientWidth + 1, `${name}: compact control overflows`)
      for (const text of control.querySelectorAll('span:not(.sr-only)')) {
        check(getComputedStyle(text).display === 'none', `${name}: compact text is visible`)
      }
    }
    for (const label of ['Sessões', 'Chat', 'Uso', 'Logs', 'Minha conta', 'Chaves de API', 'Documentação', 'MCP']) {
      const link = sidebar()?.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`)
      check(link && link.querySelector('svg'), `collapsed link ${label} needs an accessible name and icon`)
    }
    const chat = sidebar()!.querySelector<HTMLAnchorElement>('a[aria-label="Chat"]')!
    const active = isDefault ? sidebar()!.querySelector<HTMLAnchorElement>('a[aria-label="Sessões"]')! : chat
    check(active.getAttribute('aria-current') === 'page', 'active link must retain aria-current')
    check(active.getAttribute('data-active') === 'true', 'active link styling must remain')
    check(!!sidebar()?.querySelector('button[aria-label="Deslogar"] svg'), 'collapsed logout needs an accessible icon button')
    check(!!button('Ativar tema escuro'), 'collapsed theme icon button missing')
    button('Ativar tema escuro')!.click()
    await wait(() => !!button('Ativar tema claro'), 'theme button did not toggle to dark')
    const darkDivider = isDefault ? '' : checkChatDivider('collapsed dark')
    if (!isDefault) check(darkDivider !== lightDivider, 'dark theme divider color must differ from light')
    button('Expandir menu')!.click()
    await wait(() => sidebar()?.dataset.state === 'expanded', 'sidebar did not reopen in dark theme')
    await new Promise(resolve => setTimeout(resolve, 300))
    if (!isDefault) check(checkChatDivider('expanded dark') === darkDivider, 'dark divider color changed on expansion')
    button('Ativar tema claro')!.click()
    await wait(() => !!button('Ativar tema escuro'), 'theme button did not toggle back to light')
    button('Recolher menu')!.click()
    await wait(() => sidebar()?.dataset.collapsible === 'icon', 'sidebar did not collapse again')
    chat.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))
    await wait(() => [...document.querySelectorAll('[role="tooltip"]')].some(el => el.textContent?.includes('Chat')), 'collapsed Chat tooltip missing')
    button('Expandir menu')!.click()
    await wait(() => sidebar()?.dataset.state === 'expanded', 'sidebar did not reopen')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }))
    await wait(() => sidebar()?.dataset.collapsible === 'icon', 'Ctrl+B did not collapse')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }))
    await wait(() => sidebar()?.dataset.state === 'expanded', 'Ctrl+B did not reopen')
  }
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
