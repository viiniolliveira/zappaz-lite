import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import { MemoryRouter, useLocation } from 'react-router'
import { toast } from 'sonner'
import { api } from '../../src/lib/api-client'
import { chatConnectionStatusAtom, chatKeys, chatMessagePagesAtom, chatReconnectAttemptAtom, chatSessionStateAtom, chatSubscribedAtom, chatSubscribedSessionIdAtom } from '../../src/atoms/chat-cache'
import { chatSessionIdAtom, selectedChatIdAtom } from '../../src/atoms/ui'
import ChatStatusToasts from '../../src/components/chat/chat-status-toasts'
import { appSocketAtom } from '../../src/atoms/realtime-app'
import type { Socket } from 'socket.io-client'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, 'one')
store.set(chatSubscribedSessionIdAtom, 'one')
store.set(chatConnectionStatusAtom, 'open')
const base = { connected: true, enabled: true, syncStatus: 'idle' as const }
const progress = (phase: 'saving' | 'waiting' | 'complete' | 'error', messages = 0) => ({ phase, messages, contacts: 0, conversations: 0 })
store.set(chatSessionStateAtom, { ...base, syncProgress: progress('complete') })
let path = ''
function Location() { path = useLocation().pathname; return null }
const requests: string[] = []
api.defaults.adapter = async config => {
  requests.push(config.url ?? '')
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: [], page: { hasMore: false, nextCursor: null }, boundaries: { first: null, last: null } } }
}
const root = createRoot(document.body)
const id = (kind: string, session = 'one') => `chat:${session}:${kind}`
function current(key: string) { return toast.getHistory().find(item => item.id === key && !('dismiss' in item)) as { id: string; title?: unknown; type?: string; description?: unknown; onDismiss?: () => void; action?: { label: string; onClick: () => void } } | undefined }
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message) }
async function setState(value: Parameters<typeof store.set<typeof chatSessionStateAtom>>[1]) { await act(async () => store.set(chatSessionStateAtom, value)) }
async function invoke(key: string, label: string) { const action = current(key)?.action; expect(action?.label === label, `missing action ${label}`); await act(async () => { action.onClick(); await Promise.resolve() }) }
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
await act(async () => root.render(createElement(Provider, { store }, createElement(MemoryRouter, null, createElement(Location), createElement(ChatStatusToasts)))))
await check('initial complete snapshot and sync transitions', async () => {
  expect(!current(id('sync')), 'initial complete unexpectedly notified')
  await setState({ ...base, syncStatus: 'syncing', syncProgress: progress('saving', 1234) })
  expect(current(id('sync'))?.type === 'loading', 'saving not loading')
  expect(current(id('sync'))?.description === '1.234 mensagens processadas (inclui reprocessamentos).', 'incorrect count')
  await setState({ ...base, syncStatus: 'syncing', syncProgress: progress('saving', 1235) })
  await setState({ ...base, syncStatus: 'syncing', syncProgress: progress('waiting', 1235) })
  expect(current(id('sync'))?.title === 'Aguardando histórico do WhatsApp…', 'waiting not shown')
  expect(toast.getHistory().filter(item => item.id === id('sync')).length === 1, 'duplicate progress toasts')
  await setState({ ...base, syncProgress: progress('complete') })
  expect(current(id('sync'))?.type === 'success', 'completion not shown')
})
await check('independent connection and reconnect/sign-in actions', async () => {
  await act(async () => store.set(chatConnectionStatusAtom, 'connecting'))
  expect(current(id('connection'))?.type === 'loading', 'connecting not shown')
  expect(current(id('sync'))?.type === 'success', 'sync replaced by connection')
  await act(async () => store.set(chatConnectionStatusAtom, 'closed'))
  await invoke(id('connection'), 'Reconectar'); await invoke(id('connection'), 'Reconectar')
  expect(store.get(chatReconnectAttemptAtom) === 2, 'reconnect count incorrect')
  await act(async () => store.set(chatConnectionStatusAtom, 'open'))
  expect(current(id('connection'))?.type === 'success', 'open not shown')
  await act(async () => store.set(chatConnectionStatusAtom, 'unauthorized'))
  await invoke(id('connection'), 'Entrar')
  expect(path === '/sign-in', `wrong path ${path}`)
  await act(async () => store.set(chatConnectionStatusAtom, 'open'))
})
await check('WhatsApp state and session action independent from transport', async () => {
  await setState({ ...base, connected: false })
  expect(current(id('whatsapp'))?.type === 'warning', 'disconnection missing')
  expect(current(id('connection'))?.type === 'success', 'transport toast replaced')
  await invoke(id('whatsapp'), 'Abrir sessão')
  expect(path === '/sessions/one', `wrong session path ${path}`)
  await setState(base)
  expect(current(id('whatsapp'))?.type === 'success', 'reconnection missing')
})
await check('sync error reloads conversations and only enabled messages', async () => {
  await setState({ ...base, syncStatus: 'error', syncProgress: progress('error') })
   expect(current(id('sync'))?.type === 'warning', 'sync error missing')
  requests.length = 0
  await invoke(id('sync'), 'Recarregar histórico')
  expect(requests.length === 1 && requests[0].includes('conversations'), `unexpected requests ${requests}`)
  await act(async () => { store.set(selectedChatIdAtom, 'conversation'); store.set(chatSubscribedAtom, true) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  requests.length = 0
  await invoke(id('sync'), 'Recarregar histórico')
  expect(requests.some(x => x.includes('messages')) && requests.some(x => x.includes('conversations')), `missing reload ${requests}; enabled=${store.get(chatMessagePagesAtom).isEnabled}; selected=${store.get(selectedChatIdAtom)}`)
})
await check('history errors are independent and hidden while transport is offline', async () => {
  const query = client.getQueryCache().find({ queryKey: chatKeys.conversations('one', '') })
  expect(query, 'missing conversation query')
  await act(async () => { query.setState({ status: 'error', error: new Error('Falha no histórico') }); await new Promise(resolve => setTimeout(resolve, 50)) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  expect(current(id('history'))?.description === 'Falha no histórico', 'history error missing')
   expect(current(id('sync'))?.type === 'warning', 'sync error replaced by history error')
  await act(async () => store.set(chatConnectionStatusAtom, 'closed'))
  expect(!toast.getToasts().some(item => item.id === id('history')), 'history error remains offline')
  await act(async () => store.set(chatConnectionStatusAtom, 'open'))
  await invoke(id('history'), 'Recarregar histórico')
})
await check('dismiss and reload acknowledge the error in the backend', async () => {
  const acknowledgements: string[] = []
  const socket = {
    connected: true,
    timeout: () => socket,
    emitWithAck: async (event: string, input: { sessionId: string; errorId: string }) => {
      expect(event === 'chat.sync.acknowledge' && input.sessionId === 'one', 'wrong acknowledgement')
      acknowledgements.push(input.errorId)
      store.set(chatSessionStateAtom, base)
      return { ok: true }
    },
  }
  store.set(appSocketAtom, socket as unknown as Socket)
  const first = crypto.randomUUID()
  await setState({ ...base, syncStatus: 'error', syncProgress: { ...progress('error'), errorId: first } })
  await act(async () => { current(id('sync'))?.onDismiss?.(); await Promise.resolve() })
  expect(acknowledgements[0] === first && store.get(chatSessionStateAtom)?.syncStatus === 'idle', 'dismiss did not clear failure')
  const second = crypto.randomUUID()
  await setState({ ...base, syncStatus: 'error', syncProgress: { ...progress('error'), errorId: second } })
  expect(current(id('sync'))?.type === 'warning', 'new failure not shown')
  await invoke(id('sync'), 'Recarregar histórico')
  expect(acknowledgements[1] === second && store.get(chatSessionStateAtom)?.syncStatus === 'idle', 'reload did not clear failure')
})
await check('session switch and unmount dismiss all scoped toasts', async () => {
  const dismissed: (string | number | undefined)[] = []
  await act(async () => { store.set(chatSessionIdAtom, 'two'); store.set(chatSubscribedSessionIdAtom, 'two') })
  for (const kind of ['connection', 'whatsapp', 'sync', 'history']) if (toast.getToasts().some(t => t.id === id(kind))) dismissed.push(id(kind))
  expect(dismissed.length === 0, `old session toasts remain ${dismissed}`)
  await act(async () => store.set(chatConnectionStatusAtom, 'closed'))
  expect(current(id('connection', 'two'))?.type === 'error', 'new session missing')
  await act(async () => root.unmount())
  expect(!toast.getToasts().some(t => typeof t.id === 'string' && t.id.startsWith('chat:two:')), 'new session toasts remain')
})
document.body.textContent = JSON.stringify(results)
