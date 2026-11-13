import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { FormProvider, useForm } from 'react-hook-form'
import { logRevisionAtom } from '../../src/atoms/log-updates'
import WebhookLogsTable from '../../src/components/logs/WebhookLogsTable'
import { api } from '../../src/lib/api-client'
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
store.set(queryClientAtom, client)
api.defaults.adapter = async (config) => ({
  config,
  status: 200,
  statusText: 'OK',
  headers: {},
  data: { status: 'success', data: [], page: config.params?.page ?? 1, pageSize: 25, total: 100 },
})
function App() {
  const form = useForm({
    defaultValues: { sessionId: 'session-a', webhookId: 'hook-a', page: 2, pageSize: 25 },
  })
  return createElement(FormProvider, { ...form }, createElement(WebhookLogsTable))
}
const container = document.getElementById('root')
if (!container) throw new Error('Missing root element')
const root = createRoot(container)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
await act(async () => {
  root.render(createElement(Provider, { store }, createElement(App)))
  await new Promise((resolve) => setTimeout(resolve, 50))
})
await check('later pages show only scoped updates', async () => {
  await act(async () => store.set(logRevisionAtom('session-b:hook-a'), 1))
  expect(
    !document.getElementById('root')?.textContent?.includes('Novos logs disponíveis'),
    'foreign update shown',
  )
  await act(async () => store.set(logRevisionAtom('session-a:hook-a'), 1))
  expect(
    document.getElementById('root')?.textContent?.includes('Novos logs disponíveis'),
    'missing update notice',
  )
})
if (!location.search.includes('screenshot')) {
  await check('notice button returns to first page and clears notice', async () => {
    const button = [...document.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('voltar à primeira página'),
    )
    expect(button, 'missing return button')
    await act(async () => {
      button.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(
      !document.getElementById('root')?.textContent?.includes('Novos logs disponíveis'),
      'notice remains on first page',
    )
  })
  await act(async () => root.unmount())
  client.clear()
  document.body.textContent = JSON.stringify(results)
}
