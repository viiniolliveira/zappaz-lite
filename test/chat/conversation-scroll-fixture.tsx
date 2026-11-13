import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { getDefaultStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import ConversationPanel from '../../src/components/chat/conversation-panel'
import { mockMessage } from './mock-data'
import type { ChatConversation } from '../../src/lib/chat/types'

const date = '2026-01-01T00:00:00.000Z'
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
queryClient.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
getDefaultStore().set(queryClientAtom, queryClient)
const items = Array.from({ length: 20 }, (_, i) => mockMessage(i + 1, '00000000-0000-4000-8000-000000000001', { type: 'text', text: `Mensagem ${i}` }))
function conversation(id: string): ChatConversation {
  return { id, labelIds: [], sessionId: 's', jid: 'contact', contactId: null, contact: null, displayName: id, avatarUrl: null, isGroup: false, lastMessage: items.at(-1) ?? null, lastActivityAt: date, unreadCount: 0, lastReadMessageRecordId: null, createdAt: date, updatedAt: date, revision: 1, messages: items }
}
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
const wait = async (predicate: () => boolean, label: string) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error(label) }
const check = (condition: unknown, label: string) => { if (!condition) throw new Error(label) }
async function run() {
  window.fetch = () => Promise.reject(new Error('network forbidden'))
  const root = createRoot(document.getElementById('root')!)
  let resolveSend: ((value: boolean) => void) | undefined
  let calls = 0
  const onSend = () => { calls++; return new Promise<boolean>(resolve => { resolveSend = resolve }) }
  const render = (value: ChatConversation | undefined, loading = false) => root.render(<ConversationPanel conversation={value} loading={loading} onBack={() => {}} onSend={onSend} />)
  const history = () => document.querySelector<HTMLElement>('section[aria-label^="Histórico de "]')!
  const bottom = () => history().scrollHeight - history().clientHeight - history().scrollTop
  let ups = 0
  const up = async () => { ups++;  history().scrollTop = 100; await frames(); check(history().scrollTop === 100, `scroll up ${ups}: ${history().scrollTop}`) }
  const send = async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]')!
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'teste')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await frames()
    document.querySelector<HTMLButtonElement>('button[aria-label="Enviar mensagem"]')!.click()
    const expected = calls + 1
    // A click invokes the callback synchronously unless React is still committing.
    await wait(() => !!resolveSend, `send callback ${expected}`)
  }
  render(conversation('a'), true)
  await wait(() => !!history()?.querySelector('[role=status]') && bottom() <= 1 && history().scrollHeight > 400, 'loading history already at bottom')
  render(conversation('a'))
  // The loading render already satisfies the geometry check; wait for the ready commit too.
  await wait(() => !history().querySelector('[role=status]') && bottom() <= 1 && history().scrollHeight > 400, 'async opening follows bottom')
  await frames(); await up()
  render({ ...conversation('a'), messages: [...items, mockMessage(100, '00000000-0000-4000-8000-000000000001', { type: 'text', text: 'incoming' })] })
  await frames(); check(history().scrollTop === 100, 'incoming must preserve reading position')
  await send(); resolveSend!(true); resolveSend = undefined
  await wait(() => bottom() <= 1, 'successful send follows bottom')
  await up(); await send(); resolveSend!(false); resolveSend = undefined
  await frames(); check(history().scrollTop === 100, 'failed send must not scroll')
  await send()
  render(conversation('b'))
  await wait(() => !!document.querySelector('[aria-label="Histórico de b"]') && bottom() <= 1, 'switch follows bottom')
  await frames(); await up(); resolveSend!(true); resolveSend = undefined
  await frames(); check(history().scrollTop === 100, 'stale success must not scroll another conversation')
  render(conversation('a'))
  await wait(() => !!document.querySelector('[aria-label="Histórico de a"]') && bottom() <= 1, 'reopen follows bottom')
  await frames(); await up()
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Anexar arquivo"]')!
  const transfer = new DataTransfer(); transfer.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
  input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => !!document.querySelector('[aria-label="Preparar envio de arquivos"]'), 'attachment workspace opens')
  check(history().clientHeight === 0, 'history hidden in attachment workspace')
  document.querySelector<HTMLButtonElement>('button[aria-label="Enviar 1 arquivo"]')!.click()
  await wait(() => !!resolveSend, 'attachment send callback')
  resolveSend!(true); resolveSend = undefined
  await wait(() => !document.querySelector('[aria-label="Preparar envio de arquivos"]') && history().clientHeight > 0 && bottom() <= 1, 'attachment success follows bottom when visible')
  root.unmount(); document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
