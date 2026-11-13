import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, createStore, useAtomValue } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import { api } from '../../src/lib/api-client'
import { chatAccessDeniedAtom, chatConversationPagesAtom, chatSubscribedAtom, chatSubscribedSessionIdAtom } from '../../src/atoms/chat-cache'
import { chatContactPagesAtom } from '../../src/atoms/chat-contacts'
import { chatContactQueryAtom, chatContactSearchAtom, chatConversationQueryAtom, chatConversationSearchAtom, chatSessionIdAtom, chatSidebarTabAtom } from '../../src/atoms/ui'
import ChatSearchSync from '../../src/components/chat/chat-search-sync'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, 'one'); store.set(chatSubscribedSessionIdAtom, 'one'); store.set(chatSubscribedAtom, true); store.set(chatSidebarTabAtom, 'contacts')
const requests: { url: string; q: string }[] = []
api.defaults.adapter = async config => {
  requests.push({ url: config.url ?? '', q: config.params?.q ?? '' })
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: [], page: { hasMore: false, nextCursor: null } } }
}
function Queries() { useAtomValue(chatConversationPagesAtom); useAtomValue(chatContactPagesAtom); return null }
const root = createRoot(document.body)
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message) }
async function wait(ms: number) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
await act(async () => root.render(createElement(Provider, { store }, createElement(ChatSearchSync), createElement(Queries))))
await wait(50)
await check('typing changes raw values without intermediate requests', async () => {
  requests.length = 0
  await act(async () => { store.set(chatConversationSearchAtom, 'r'); store.set(chatContactSearchAtom, 'm') })
  await wait(100)
  await act(async () => { store.set(chatConversationSearchAtom, 'rafa'); store.set(chatContactSearchAtom, 'maria') })
  await wait(250)
  expect(store.get(chatConversationSearchAtom) === 'rafa' && store.get(chatContactSearchAtom) === 'maria', 'input values not immediate')
  expect(store.get(chatConversationQueryAtom) === '' && store.get(chatContactQueryAtom) === '', 'query changed before debounce')
  expect(requests.length === 0, `intermediate requests ${JSON.stringify(requests)}`)
  await wait(350)
  expect(store.get(chatConversationQueryAtom) === 'rafa' && store.get(chatContactQueryAtom) === 'maria', 'final query not applied')
  expect(requests.every(r => r.url.endsWith('/conversations') ? r.q === 'rafa' : r.url.endsWith('/contacts') && r.q === 'maria') && requests.some(r => r.url.endsWith('/conversations') && r.q === 'rafa') && requests.some(r => r.url.endsWith('/contacts') && r.q === 'maria'), `incorrect requests ${JSON.stringify(requests)}`)
})
await check('switching sessions cancels pending old searches', async () => {
  requests.length = 0
  await act(async () => { store.set(chatConversationSearchAtom, 'old conversation'); store.set(chatContactSearchAtom, 'old contact') })
  await wait(100)
  await act(async () => {
    // The realtime session cleanup clears both raw and applied searches.
    store.set(chatConversationSearchAtom, ''); store.set(chatContactSearchAtom, '')
    store.set(chatConversationQueryAtom, ''); store.set(chatContactQueryAtom, '')
    store.set(chatSubscribedSessionIdAtom, 'two'); store.set(chatSessionIdAtom, 'two')
  })
  await wait(650)
  expect(store.get(chatConversationQueryAtom) === '' && store.get(chatContactQueryAtom) === '', 'old value applied in new session')
  expect(!requests.some(r => r.q.startsWith('old')), `old search requested ${JSON.stringify(requests)}`)
})
await check('access loss and unmount clear applied searches and cancel pending values', async () => {
  await act(async () => { store.set(chatConversationSearchAtom, 'pending'); store.set(chatContactSearchAtom, 'pending') })
  await act(async () => store.set(chatAccessDeniedAtom, true))
  await wait(600)
  expect(store.get(chatConversationQueryAtom) === '' && store.get(chatContactQueryAtom) === '', 'denied session applied query')
  await act(async () => root.unmount())
  expect(store.get(chatConversationQueryAtom) === '' && store.get(chatContactQueryAtom) === '', 'unmount retained queries')
})
client.clear()
document.body.textContent = JSON.stringify(results)
