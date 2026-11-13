import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { chatSubscribedAtom, chatSubscribedSessionIdAtom } from '../../src/atoms/chat-cache'
import { quickMessageKeys } from '../../src/atoms/quick-messages'
import { chatSessionIdAtom } from '../../src/atoms/ui'
import MessageComposer from '../../src/components/chat/message-composer'
import { api } from '../../src/lib/api-client'
import type { QuickMessage } from '../../src/lib/chat/quick-messages'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const date = new Date().toISOString()
const messages: QuickMessage[] = [
  { id: '00000000-0000-4000-8000-000000000001', sessionId: 'a', name: 'Boas-vindas', command: 'ola', message: 'Olá!\nComo ajudar?', createdAt: date, updatedAt: date },
  { id: '00000000-0000-4000-8000-000000000002', sessionId: 'a', name: 'Pagamento', command: 'pix', message: 'Nossa chave Pix', createdAt: date, updatedAt: date },
  { id: '00000000-0000-4000-8000-000000000003', sessionId: 'b', name: 'Outra sessão', command: 'ola', message: 'Texto da sessão B', createdAt: date, updatedAt: date },
]
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
for (const sessionId of ['a', 'b']) client.setQueryData(quickMessageKeys.list(sessionId), messages.filter(item => item.sessionId === sessionId))
const store = createStore()
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, 'a')
store.set(chatSubscribedAtom, true)
store.set(chatSubscribedSessionIdAtom, 'a')
const requests: { method: string; url: string }[] = []
api.defaults.adapter = async config => {
  const sessionId = config.url?.includes('/session/b/') ? 'b' : 'a'
  const id = config.url?.split('/').at(-1)
  const method = config.method ?? 'get'
  requests.push({ method, url: config.url ?? '' })
  let data: unknown
  if (method === 'get') data = messages.filter(item => item.sessionId === sessionId)
  else if (method === 'delete') {
    const index = messages.findIndex(item => item.id === id && item.sessionId === sessionId)
    assert(index >= 0, 'delete scope incorrect'); messages.splice(index, 1); data = { quickMessageId: id }
  } else {
    const input = JSON.parse(config.data) as Pick<QuickMessage, 'name' | 'command' | 'message'>
    if (method === 'patch') {
      const item = messages.find(item => item.id === id && item.sessionId === sessionId)
      assert(item, 'update scope incorrect'); Object.assign(item, input); data = { ...item }
    } else { const item = { ...input, sessionId, id: crypto.randomUUID(), createdAt: date, updatedAt: date }; messages.push(item); data = item }
  }
  return { data: { status: 'success', data }, status: 200, statusText: 'OK', headers: {}, config }
}
let sends = 0
const root = createRoot(document.body)
await act(async () => root.render(<Provider store={store}><MessageComposer draftKey="a/contact" onSend={() => { sends++; return true }} onAttach={() => true} /></Provider>))
function textarea() { const element = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]'); assert(element, 'missing composer'); return element }
async function input(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    element.focus()
    Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function key(key: string, options: KeyboardEventInit = {}) { await act(async () => { textarea().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })) }) }
async function click(text: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === text || item.textContent === text)
  assert(element, `missing button ${text}`)
  await act(async () => { element.click(); await Promise.resolve() })
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) }) }
await check('slash menu keyboard inserts without sending and preserves focus', async () => {
  await input(textarea(), '/')
  assert(document.querySelectorAll('[cmdk-item]').length === 2, 'missing suggestions')
  assert(document.activeElement === textarea(), 'menu stole focus')
  await key('ArrowDown')
  await key('Enter')
  assert(textarea().value === 'Nossa chave Pix' && sends === 0, 'selection sent or chose wrong item')
  assert(document.activeElement === textarea(), 'insertion lost focus')
  assert(!document.querySelector('[cmdk-root]'), 'menu not closed after insertion')
})
await check('search by command and name, click, empty results, Escape and IME', async () => {
  await input(textarea(), '/BOAS')
  assert(document.querySelectorAll('[cmdk-item]').length === 1, 'name filter failed')
  await key('Enter', { isComposing: true })
  assert(textarea().value === '/BOAS' && sends === 0, 'IME selected or sent')
  const item = document.querySelector<HTMLElement>('[cmdk-item]')
  assert(item, 'missing filtered item')
  await act(async () => item.click())
  assert(textarea().value === 'Olá!\nComo ajudar?' && sends === 0, 'click lost multiline message')
  await input(textarea(), '/pix')
  assert(document.querySelectorAll('[cmdk-item]').length === 1, 'command filter failed')
  await key('Escape')
  assert(!document.querySelector('[cmdk-root]') && textarea().value === '/pix', 'Escape changed draft')
  await input(textarea(), '/missing')
  await key('Enter')
  assert(textarea().value === '/missing' && sends === 0, 'empty menu sent slash command')
  await input(textarea(), 'https://example.com/')
  assert(!document.querySelector('[cmdk-root]'), 'URL opened suggestions')
})
await check('manager creates, edits and confirms deletion without sending drafts', async () => {
  await click('Mensagens rápidas')
  await click('Nova mensagem rápida')
  await input(document.querySelector<HTMLInputElement>('#quick-message-name')!, 'Encerramento')
  await input(document.querySelector<HTMLInputElement>('#quick-message-command')!, 'fim')
  await input(document.querySelector<HTMLTextAreaElement>('#quick-message-body')!, 'Obrigado!')
  await click('Salvar mensagem'); await settle()
  assert(requests.some(item => item.method === 'post' && item.url.includes('/session/a/')), 'create did not use session a')
  await click('Editar mensagem Encerramento')
  await input(document.querySelector<HTMLTextAreaElement>('#quick-message-body')!, 'Até logo!')
  await click('Salvar mensagem'); await settle()
  assert(messages.find(item => item.command === 'fim')?.message === 'Até logo!', 'edit failed')
  await click('Excluir mensagem Encerramento')
  assert(messages.some(item => item.command === 'fim'), 'deleted without confirmation')
  await click('Excluir mensagem'); await settle()
  assert(!messages.some(item => item.command === 'fim') && sends === 0, 'delete failed or modal sent draft')
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
})
await check('session switch closes manager and suggestions contain only the new session', async () => {
  await act(async () => { store.set(chatSessionIdAtom, 'b'); store.set(chatSubscribedSessionIdAtom, 'b') })
  await input(textarea(), '/')
  assert(document.querySelectorAll('[cmdk-item]').length === 1 && document.querySelector('[cmdk-item]')?.textContent?.includes('Outra sessão'), 'suggestions leaked sessions')
  await key('Enter')
  assert(textarea().value === 'Texto da sessão B' && sends === 0, 'wrong session text')
})
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
