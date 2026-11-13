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
const copiedValues: string[] = []
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: async (value: string) => {
      copiedValues.push(value)
    },
  },
})
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
function secret(prefix: string) {
  const input = document.querySelector<HTMLInputElement>(`#${prefix}-secret`)
  expect(input, `Missing ${prefix} secret input`)
  return input
}
async function click(button: HTMLButtonElement | null) {
  expect(button, 'Missing button')
  await act(async () => {
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}
await act(async () => {
  root.render(
    createElement(
      Provider,
      { store },
      createElement(CreateWebhookModal, { sessionId: 'session-a' }),
      createElement(EditWebhookModal, { sessionId: 'session-a' }),
    ),
  )
})
let first = ''
await check('creation generates a secret and the accessible button replaces it', async () => {
  await act(async () => store.set(createWebhookModalOpenAtom, true))
  first = secret('create').value
  expect(/^[0-9a-f]{64}$/.test(first), 'Initial secret is not 32 random bytes in hex')
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Gerar novo segredo"]',
  )
  expect(button?.type === 'button', 'Generate button must not submit the form')
  await click(button)
  const replacement = secret('create').value
  expect(
    /^[0-9a-f]{64}$/.test(replacement) && replacement !== first,
    'Generated secret did not replace the original',
  )
  expect(requests.length === 0, 'Generating a secret submitted the form')
})
await check('copy uses the current generated secret', async () => {
  const current = secret('create').value
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Copiar para área de transferência"]',
  )
  await click(button)
  expect(
    copiedValues.length === 1 && copiedValues[0] === current,
    'Copied value is not the current secret',
  )
  expect(requests.length === 0, 'Copying a secret submitted the form')
})
await check('reopening creation generates a fresh secret', async () => {
  const previous = secret('create').value
  await act(async () => store.set(createWebhookModalOpenAtom, false))
  await act(async () => store.set(createWebhookModalOpenAtom, true))
  expect(
    /^[0-9a-f]{64}$/.test(secret('create').value) && secret('create').value !== previous,
    'Reopening did not generate a fresh secret',
  )
  await act(async () => store.set(createWebhookModalOpenAtom, false))
})
async function openEdit(savedSecret: string | null) {
  await act(async () => {
    store.set(editWebhookModalOpenAtom, false)
    store.set(selectedWebhookAtom, {
      id: 'hook-a',
      waSessionId: 'session-a',
      displayName: 'Existing',
      url: 'https://example.com/hook',
      enabled: true,
      createdAt: '2026-01-01',
      secret: savedSecret,
      headers: {},
      events: { call: true } as WebhookEvents,
    })
    store.set(editWebhookModalOpenAtom, true)
  })
}
async function submitEdit() {
  const form = secret('edit').closest('form')
  expect(form, 'Missing edit form')
  await act(async () => {
    form.requestSubmit()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
}
await check('editing loads and copies the existing secret without a removal button', async () => {
  await openEdit('existing-secret')
  expect(secret('edit').value === 'existing-secret', 'Existing secret was not loaded')
  expect(
    !Array.from(document.querySelectorAll('button')).some((button) =>
      /remover segredo/i.test(`${button.textContent} ${button.getAttribute('aria-label')}`),
    ),
    'Remove secret button is still visible',
  )
  const previousCopies = copiedValues.length
  await click(
    document.querySelector<HTMLButtonElement>(
      'button[aria-label="Copiar para área de transferência"]',
    ),
  )
  expect(
    copiedValues.length === previousCopies + 1 && copiedValues.at(-1) === 'existing-secret',
    'Copied value is not the existing secret',
  )
  expect(requests.length === 0, 'Copying submitted the form')
})
await check('submitting the existing secret preserves it', async () => {
  await openEdit('existing-secret')
  const previousRequests = requests.length
  await submitEdit()
  expect(
    requests.length === previousRequests + 1 && requests.at(-1)?.method === 'put',
    'Edit request was not sent',
  )
  expect(
    requests.at(-1)?.data.secret === 'existing-secret',
    'Edit did not send the existing secret',
  )
})
await check('clearing the existing secret sends null', async () => {
  await openEdit('existing-secret')
  const input = secret('edit')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    expect(setter, 'Missing input value setter')
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const previousRequests = requests.length
  await submitEdit()
  expect(
    requests.length === previousRequests + 1 && requests.at(-1)?.method === 'put',
    'Edit request was not sent',
  )
  expect(requests.at(-1)?.data.secret === null, 'Clearing the secret did not send null')
})
await check('editing without a secret starts empty', async () => {
  await openEdit(null)
  expect(secret('edit').value === '', 'Absent secret did not produce an empty field')
})
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
