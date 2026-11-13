import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import type { AxiosAdapter } from 'axios'
import { api } from '../../src/lib/api-client'
import { mockConversations, mockSessionId } from './mock-data'
import { chatKeys, chatLiveCacheAtom } from '../../src/atoms/chat-cache'
import { sessionKeys } from '../../src/atoms/session'
import { chatContactFormAtom, chatContactPanelAtom, chatSessionIdAtom, chatSidebarTabAtom, selectedChatIdAtom } from '../../src/atoms/ui'
import ConversationList from '../../src/components/chat/conversation-list'
import ChatSearchSync from '../../src/components/chat/chat-search-sync'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
store.set(queryClientAtom, client); store.set(chatSessionIdAtom, mockSessionId)
const contact = { ...mockConversations[0].contact!, isSaved: true, localName: 'Marina Costa', lid: null }
client.setQueryData(chatKeys.contacts(mockSessionId, ''), { pages: [{ status: 'success', data: [], page: { hasMore: false, nextCursor: null } }], pageParams: [undefined] })
const otherSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
client.setQueryData(sessionKeys.list(), { data: [{ id: mockSessionId, displayName: 'Sessão inicial', enabled: true, status: 'open', profilePictureUrl: null }, { id: otherSession, displayName: 'Outra sessão', enabled: true, status: 'open', profilePictureUrl: null }] })
store.set(chatLiveCacheAtom, { contacts: [contact], conversations: [], messages: [] })
const requests: { method: string; body: unknown }[] = []
api.defaults.adapter = (async config => {
  const method = config.method ?? ''
  if (method === 'get') return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: [] } }
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
  requests.push({ method, body })
  if (method === 'post' && config.url?.endsWith('/conversations')) return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: mockConversations[0] } }
  const name = body?.name ?? contact.localName
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: { ...contact, localName: method === 'delete' ? null : name, displayName: name, email: body?.email ?? null, annotations: body?.annotations ?? null, isSaved: method !== 'delete', revision: requests.length + 1 } } }
}) satisfies AxiosAdapter
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
function byText(selector: string, text: string) { const e = [...document.querySelectorAll<HTMLElement>(selector)].find(x => x.textContent?.trim() === text); if (!e) throw Error(`Missing ${selector}: ${text}`); return e }
function element<T extends Element>(selector: string): T { const e = document.querySelector<T>(selector); if (!e) throw Error(`Missing ${selector}`); return e }
async function click(e: HTMLElement) { await act(async () => { e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); e.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })); e.click(); await Promise.resolve() }) }
async function input(selector: string, value: string) { await act(async () => { const e = element<HTMLInputElement | HTMLTextAreaElement>(selector); const prototype = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })) }) }
const root = createRoot(document.body)
let selected = ''
const conversations = [{ ...mockConversations[0], contact }, ...mockConversations.slice(1)]
await act(async () => root.render(createElement(Provider, { store }, createElement(ChatSearchSync), createElement(ConversationList, { conversations, selectedId: conversations[1].id, onSelect: id => { selected = id } }))))
await check('sidebar navigation retains conversation state and moves focus', async () => {
  if (document.querySelector('[role="tablist"], [role="tab"]')) throw Error('Chat navigation still exposes tabs')
  if (document.querySelector('[aria-label="Buscar contatos"]')) throw Error('Contact list mounted before opening')
  await input('[aria-label="Buscar conversas"]', 'Rafael')
  byText('li button span', conversations[0].displayName)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)) })
  if ([...document.querySelectorAll('li button span')].some(item => item.textContent?.trim() === conversations[0].displayName)) throw Error('Local filter did not apply after debounce')
  await click(byText('[aria-label="Filtrar conversas"] button', 'Não lidas 1'))
  const selectedCard = byText('li button span', conversations[1].displayName).closest('button')
  if (selectedCard?.getAttribute('aria-current') !== 'true') throw Error('Selected conversation not marked')
  await click(element('[aria-label="Nova conversa"]'))
  if (store.get(chatSidebarTabAtom) !== 'contacts') throw Error('New conversation did not open contacts')
  if (document.activeElement !== element('[aria-label="Voltar para conversas"]')) throw Error('Back button did not receive focus')
  element('[aria-label^="Sessão do chat"]'); if (document.querySelector('footer[aria-label="Conexão do chat"]')) throw Error('Old connection footer still rendered')
  await input('[aria-label="Buscar contatos"]', 'outro')
  await click(element('[aria-label="Voltar para conversas"]'))
  if (store.get(chatSidebarTabAtom) !== 'conversations') throw Error('Back did not open conversations')
  if (document.activeElement !== element('[aria-label="Nova conversa"]')) throw Error('New conversation button did not regain focus')
  if (document.querySelector('[aria-label="Buscar contatos"]')) throw Error('Contact list remained mounted')
  if (element<HTMLInputElement>('[aria-label="Buscar conversas"]').value !== 'Rafael') throw Error('Conversation search changed')
  if (byText('[aria-label="Filtrar conversas"] button', 'Não lidas 1').getAttribute('aria-pressed') !== 'true') throw Error('Unread filter changed')
  if (byText('li button span', conversations[1].displayName).closest('button')?.getAttribute('aria-current') !== 'true') throw Error('Selected conversation changed')
  await click(element('[aria-label="Nova conversa"]'))
  if (element<HTMLInputElement>('[aria-label="Buscar contatos"]').value !== 'outro') throw Error('Contact search changed')
  await click(element('[aria-label="Limpar busca de contatos"]'))
})
await check('opening a saved contact selects its conversation and returns to conversations', async () => {
  await click(byText('li button span', contact.displayName))
  if (requests.at(-1)?.method !== 'post' || (requests.at(-1)?.body as { contactId?: string }).contactId !== contact.id) throw Error('Wrong open conversation request')
  if (store.get(selectedChatIdAtom) !== conversations[0].id || store.get(chatSidebarTabAtom) !== 'conversations') throw Error('Contact did not open its conversation')
  await click(element('[aria-label="Nova conversa"]'))
})
await check('create contact sends normalized data', async () => {
  await click(element('[aria-label="Adicionar contato"]'))
  if (!element('[name="phoneNumber"]').closest('[data-slot="form-item"]')?.querySelector('select[aria-label="Select country"]')) throw Error('Custom phone country selector is missing')
  await input('[name="name"]', ' Novo contato '); await input('[name="phoneNumber"]', '+5511999999999')
  await input('[name="email"]', 'person@example.com'); await input('[name="annotations"]', 'Notas locais')
  await click(byText('[role="dialog"] button', 'Salvar contato'))
  const body = requests.at(-1)?.body as { name: string; phoneNumber: string; email: string; annotations: string }
  if (requests.at(-1)?.method !== 'post' || body.name !== 'Novo contato' || body.phoneNumber !== '5511999999999' || body.email !== 'person@example.com' || body.annotations !== 'Notas locais') throw Error('Wrong create request')
})
await check('contact menu omits editing and retains delete confirmation', async () => {
  // Use the contact list's context menu, independent of the conversation menu.
  const card = byText('li button span', 'Novo contato')
  await act(async () => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 })))
  if ([...document.querySelectorAll('[role="menuitem"]')].some(item => item.textContent?.trim() === 'Editar contato')) throw Error('Contact menu still offers editing')
  await click(byText('[role="menuitem"]', 'Excluir contato'))
  const dialog = element<HTMLElement>('[role="dialog"]')
  if (!dialog.textContent?.includes('mensagens e as mídias serão mantidas') || !dialog.textContent.includes('Nada será alterado no WhatsApp')) throw Error('Missing preservation explanation')
  const before = requests.length; await click(byText('[role="dialog"] button', 'Cancelar'))
  if (requests.length !== before) throw Error('Cancel sent request')
  await act(async () => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 })))
  await click(byText('[role="menuitem"]', 'Excluir contato')); await click(byText('[role="dialog"] button', 'Excluir contato'))
  if (requests.at(-1)?.method !== 'delete') throw Error('Delete not sent')
})
await check('conversation actions select the target and open the panel form', async () => {
  await click(element('[aria-label="Voltar para conversas"]'))
  await input('[aria-label="Buscar conversas"]', '')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)) })
  await click(byText('[aria-label="Filtrar conversas"] button', 'Todas'))
  for (const [conversation, action] of [[conversations[0], 'Editar contato'], [conversations[1], 'Salvar contato']] as const) {
    const card = byText('li button span', conversation.displayName)
    await act(async () => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 })))
    await click(byText('[role="menuitem"]', action))
    const panel = store.get(chatContactPanelAtom)
    const form = store.get(chatContactFormAtom)
    if (selected !== conversation.id || panel?.conversationId !== conversation.id || panel.sessionId !== conversation.sessionId || panel.mediaMessageId !== null) throw Error('Conversation action targeted the wrong panel')
    if (form?.surface !== 'panel' || form.contactId !== conversation.contact?.id || form.saved !== conversation.contact?.isSaved) throw Error('Conversation action targeted the wrong form')
    if (document.querySelector('[role="dialog"][data-state="open"]')) throw Error('Conversation action opened a dialog')
  }
})
await check('switching sessions clears the active contact panel and form', async () => {
  const trigger = element<HTMLElement>('[aria-label^="Sessão do chat"]')
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))
    trigger.click()
  })
  const option = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('Outra sessão'))
  if (!option) throw Error('Missing other session option')
  await click(option)
  if (store.get(chatSessionIdAtom) !== otherSession || store.get(chatContactPanelAtom) !== null || store.get(chatContactFormAtom) !== null) throw Error('Session change retained contact state')
})
await act(async () => root.unmount()); client.clear(); document.body.textContent = JSON.stringify(results)
