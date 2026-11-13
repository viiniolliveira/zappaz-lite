import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import type { AxiosAdapter } from 'axios'
import { api } from '../../src/lib/api-client'
import { chatKeys } from '../../src/lib/chat/merge'
import { chatAccessDeniedAtom, chatLiveCacheAtom, chatSubscribedAtom, chatSubscribedSessionIdAtom } from '../../src/atoms/chat-cache'
import { chatContactFormAtom, chatContactQueryAtom, chatSessionIdAtom, selectedChatIdAtom } from '../../src/atoms/ui'
import MessageContacts from '../../src/components/chat/messages/message-contacts'
import { mockConversations, mockSessionId } from './mock-data'
import type { MessageDTO } from '../../src/lib/chat/schemas'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } } })
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
store.set(chatSubscribedAtom, true)
store.set(chatSubscribedSessionIdAtom, mockSessionId)
store.set(chatContactQueryAtom, 'outro filtro')
const savedPhone = '5511999999999', newPhone = '5511888888888', loadingPhone = '5511777777777', errorPhone = '5511666666666'
const saved = { ...mockConversations[0].contact!, phoneNumber: savedPhone, isSaved: true }
const key = (phone: string) => [...chatKeys.contacts(mockSessionId), 'shared', phone]
client.setQueryData(key(savedPhone), saved)
client.setQueryData(key(newPhone), null)
const requests: { method: string; url: string; body: unknown }[] = []
api.defaults.adapter = (async config => {
  const method = config.method ?? ''
  requests.push({ method, url: config.url ?? '', body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data })
  if (method === 'get' && config.params?.q === loadingPhone) return new Promise(() => {})
  if (method === 'get' && config.params?.q === errorPhone) throw new Error('Lookup failed')
  if (method === 'post' && config.url?.endsWith('/conversations')) return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: mockConversations[0] } }
  throw new Error(`Unexpected request ${method} ${config.url}`)
}) satisfies AxiosAdapter
const makeContact = (name: string, phone: string): MessageDTO['contacts'][number] => ({
  name, vcard: null, parsed: { name, firstName: null, lastName: null, phones: [{ number: phone, waid: null, types: [] }], emails: ['person@example.com'], organization: null },
})
const root = createRoot(document.body)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
async function render(contact: MessageDTO['contacts'][number]) { await act(async () => { root.render(createElement(Provider, { store }, createElement(MessageContacts, { contacts: [contact] }))); await Promise.resolve() }) }
function button(text: string) { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text); if (!found) throw Error(`Missing button: ${text}`); return found }
function absent(text: string) { if ([...document.querySelectorAll('button')].some(item => item.textContent?.trim() === text)) throw Error(`Unexpected button: ${text}`) }
async function click(text: string) { await act(async () => { button(text).click(); await Promise.resolve() }) }
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }

await check('saved contact offers only send and opens by contact ID', async () => {
  await render(makeContact('Salvo', savedPhone))
  absent('Salvar contato')
  if (button('Enviar mensagem').disabled) throw Error('Send disabled')
  await click('Enviar mensagem'); await flush()
  const request = requests.filter(item => item.method === 'post').at(-1)
  if (JSON.stringify(request?.body) !== JSON.stringify({ contactId: saved.id })) throw Error('Did not open saved contact')
})
await check('unsaved contact opens prefilled form and sends by phone without saving', async () => {
  await render(makeContact('Novo', '+55 (11) 88888-8888'))
  await click('Salvar contato')
  const form = store.get(chatContactFormAtom)
  if (JSON.stringify(form) !== JSON.stringify({ surface: 'dialog', name: 'Novo', phoneNumber: newPhone, saved: false, email: 'person@example.com' })) throw Error(`Wrong form ${JSON.stringify(form)}`)
  const before = requests.length
  await click('Enviar mensagem'); await flush()
  const changes = requests.slice(before)
  if (changes.length !== 1 || !changes[0].url.endsWith('/conversations') || JSON.stringify(changes[0].body) !== JSON.stringify({ phoneNumber: newPhone })) throw Error(`Wrong requests ${JSON.stringify(changes)}`)
  if (store.get(selectedChatIdAtom) !== mockConversations[0].id) throw Error('Conversation was not selected')
})
await check('live saved contact hides save even with an unrelated agenda filter', async () => {
  await act(async () => store.set(chatLiveCacheAtom, { contacts: [{ ...saved, phoneNumber: newPhone }], conversations: [], messages: [] }))
  absent('Salvar contato')
  if (button('Enviar mensagem').disabled) throw Error('Send disabled after save')
})
await check('loading disables save until the lookup completes', async () => {
  await render(makeContact('Carregando', loadingPhone))
  if (!button('Verificando contato…').disabled) throw Error('Save enabled during lookup')
})
await check('failed lookup offers retry and keeps save disabled', async () => {
  await render(makeContact('Erro', errorPhone)); await flush()
  if (!document.querySelector('[role="alert"]')?.textContent?.includes('Não foi possível verificar a agenda.')) throw Error('Missing lookup error')
  if (!button('Salvar contato').disabled || button('Tentar novamente').disabled) throw Error('Incorrect error actions')
})
await check('denied access disables actions and invalid phone cannot be used', async () => {
  await act(async () => store.set(chatAccessDeniedAtom, true))
  await render(makeContact('Negado', newPhone))
  if (!button('Enviar mensagem').disabled || !button('Salvar contato').disabled) throw Error('Denied actions enabled')
  await act(async () => store.set(chatAccessDeniedAtom, false))
  await render(makeContact('Inválido', '0123'))
  if (!button('Enviar mensagem').disabled || !button('Salvar contato').disabled || !document.body.textContent?.includes('Telefone indisponível')) throw Error('Invalid phone accepted')
})
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
