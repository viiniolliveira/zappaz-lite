import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createWebhookModalOpenAtom,
  editWebhookModalOpenAtom,
  selectedWebhookAtom,
} from '../../src/atoms/webhook'
import { api } from '../../src/lib/api-client'
import {
  CreateWebhookModal,
  EditWebhookModal,
} from '../../src/pages/session-detail/components/webhook-modals'
import type { WebhookEvents } from '../../src/services/types'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
store.set(queryClientAtom, client)
const requests: { method: string | undefined; data: Record<string, unknown> }[] = []
api.defaults.adapter = async (config) => {
  requests.push({ method: config.method, data: JSON.parse(config.data) })
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { status: 'success', data: {} },
  }
}
const container = document.getElementById('root')
if (!container) throw new Error('Missing root')
const root = createRoot(container)
const results: { name: string; ok: boolean; error?: string }[] = []
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
async function update(fn: () => void) {
  await act(async () => {
    fn()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}
function form() {
  const element = Array.from(document.querySelectorAll<HTMLFormElement>('[role="dialog"] form')).at(
    -1,
  )
  expect(element, 'Missing webhook form')
  return element
}
async function setInput(input: HTMLInputElement | null, value: string) {
  expect(input, 'Missing input')
  await update(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    expect(setter, 'Missing input setter')
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function openSearch() {
  let input = form().querySelector<HTMLInputElement>('input[role="combobox"]')
  if (!input) {
    const trigger = form().querySelector<HTMLButtonElement>('button[role="combobox"]')
    expect(trigger, 'Missing events combobox')
    await update(() => trigger.click())
    input = document.querySelector<HTMLInputElement>('input[role="combobox"]')
  } else {
    await update(() => {
      input?.focus()
      input?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
      )
      input?.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, button: 0, pointerType: 'mouse' }),
      )
      input?.click()
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
  }
  expect(input, 'Missing events search input')
  return input
}
function option(label: string) {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (element) => element.textContent?.trim() === label && !element.closest('[hidden]'),
  )
}
async function select(label: string, search: string) {
  const input = await openSearch()
  await setInput(input, search)
  const item = option(label)
  expect(item, `Missing option ${label} after search`)
  await update(() => item.click())
}
async function remove(label: string) {
  const button = Array.from(form().querySelectorAll<HTMLButtonElement>('button')).find(
    (element) => {
      const accessible = element.getAttribute('aria-label') ?? ''
      return (
        (/remov/i.test(accessible) && accessible.toLowerCase().includes(label.toLowerCase())) ||
        ((/^remove$/i.test(accessible) || element.dataset.slot === 'combobox-chip-remove') &&
          element.parentElement?.textContent?.includes(label))
      )
    },
  )
  expect(button, `Missing remove button for ${label}`)
  await update(() => button.click())
}
async function submit() {
  await update(() => form().requestSubmit())
  await update(() => {})
}
await update(() =>
  root.render(
    createElement(
      Provider,
      { store },
      createElement(CreateWebhookModal, { sessionId: 'session-a' }),
      createElement(EditWebhookModal, { sessionId: 'session-a' }),
    ),
  ),
)
await check('creation requires at least one event', async () => {
  await update(() => store.set(createWebhookModalOpenAtom, true))
  await setInput(form().querySelector('#displayName'), 'Test hook')
  await setInput(form().querySelector('#url'), 'https://example.com/hook')
  await submit()
  expect(
    form().textContent?.includes('Selecione pelo menos um evento'),
    'Missing events validation',
  )
  expect(requests.length === 0, 'Submitted without events')
})
await check('search filters options and reports no matches', async () => {
  const input = await openSearch()
  await setInput(input, 'presence')
  expect(option('Presence Update'), 'Matching event not found')
  expect(!option('Call'), 'Unrelated event shown in search')
  await setInput(input, 'event-that-does-not-exist')
  expect(
    document.body.textContent?.includes('Nenhum resultado encontrado'),
    'Missing empty search result',
  )
})
await check('creation submits selected events after adding and removing', async () => {
  await select('Call', 'call')
  await select('Presence Update', 'presence')
  expect(
    form().textContent?.includes('Call') && form().textContent?.includes('Presence Update'),
    'Selected events not displayed',
  )
  const beforeRemoval = requests.length
  await remove('Call')
  expect(requests.length === beforeRemoval, 'Removing an event submitted the form')
  expect(!form().textContent?.includes('Call'), 'Removed event still displayed')
  await submit()
  expect(requests.length === 1 && requests[0]?.method === 'post', 'Create request not sent')
  expect(
    JSON.stringify(requests[0]?.data.events) === JSON.stringify({ 'presence.update': true }),
    'Create sent incorrect events',
  )
})
await check(
  'popup stays visible and supports scrolling and selection in a small viewport',
  async () => {
    await update(() => store.set(createWebhookModalOpenAtom, true))
    const input = form().querySelector<HTMLInputElement>('input[role="combobox"]')
    expect(input, 'Missing events search input')
    await update(() => input.scrollIntoView({ block: 'center' }))
    await openSearch()
    const list = document.querySelector<HTMLElement>('[role="listbox"]')
    expect(list, 'Missing popup list')
    const popup = list.closest<HTMLElement>('[data-slot="combobox-content"]')
    expect(popup, 'Missing popup content')
    const bounds = popup.getBoundingClientRect()
    expect(bounds.width > 0 && bounds.height > 0, 'Popup is not visible')
    expect(
      bounds.top >= 0 &&
        bounds.bottom <= innerHeight &&
        bounds.left >= 0 &&
        bounds.right <= innerWidth,
      'Popup is clipped by viewport',
    )
    expect(list.scrollHeight > list.clientHeight, 'Long list is not scrollable')
    await update(() => {
      list.scrollTop = list.scrollHeight
    })
    expect(list.scrollTop > 0, 'List did not scroll')
    const item = option('Presence Update')
    expect(item, 'Missing event at end of list')
    await update(() => item.scrollIntoView({ block: 'nearest' }))
    const rect = item.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    expect(
      x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      'Scrolled option is outside viewport',
    )
    const target = document.elementFromPoint(x, y)
    expect(target && item.contains(target), 'Scrolled option is clipped or covered')
    await update(() => (target as HTMLElement).click())
    expect(
      form().textContent?.includes('Presence Update'),
      'Clicking scrolled option did not select it',
    )
  },
)
await check('editing loads active events and submits changes', async () => {
  await update(() => store.set(createWebhookModalOpenAtom, false))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300))
  })
  await update(() => {
    store.set(selectedWebhookAtom, {
      id: 'hook-a',
      waSessionId: 'session-a',
      displayName: 'Existing',
      url: 'https://example.com/hook',
      enabled: true,
      createdAt: '2026-01-01',
      secret: null,
      headers: {},
      events: { call: true, 'presence.update': true, 'messages.delete': false } as WebhookEvents,
    })
    store.set(editWebhookModalOpenAtom, true)
  })
  expect(
    form().textContent?.includes('Call') && form().textContent?.includes('Presence Update'),
    'Active events not preselected',
  )
  expect(!form().textContent?.includes('Messages Delete'), 'Inactive event preselected')
  const beforeRemoval = requests.length
  await remove('Call')
  expect(requests.length === beforeRemoval, 'Removing an event submitted the edit form')
  await select('Messages Delete', 'messages delete')
  const beforeSubmit = requests.length
  await submit()
  expect(
    requests.length === beforeSubmit + 1 && requests.at(-1)?.method === 'put',
    'Edit request not sent',
  )
  expect(
    JSON.stringify(requests.at(-1)?.data.events) ===
      JSON.stringify({ 'presence.update': true, 'messages.delete': true }),
    `Edit sent incorrect events: ${JSON.stringify(requests.at(-1)?.data)}`,
  )
})
await update(() => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
