import { QueryClient } from '@tanstack/react-query'
import type { AxiosResponse } from 'axios'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { chatLiveCacheAtom } from '../../src/atoms/chat-cache.ts'
import { chatEditMessageAtom, chatSessionIdAtom } from '../../src/atoms/ui.ts'
import EditMessageDialog from '../../src/components/chat/messages/edit-message-dialog.tsx'
import MessageActions from '../../src/components/chat/messages/message-actions.tsx'
import { api } from '../../src/lib/api-client.ts'
import type { ChatMessage } from '../../src/lib/chat/types.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
const message = mockMessage(900, mockConversations[0].id, {
  fromMe: true,
  text: 'Resposta original',
  status: 'read',
  replyTo: {
    messageRecordId: null,
    messageId: 'quoted-id',
    senderJid: null,
    fromMe: false,
    type: 'text',
    text: 'Mensagem citada',
    contacts: [],
    media: null,
  },
})
let calls = 0
let finish: (() => void) | undefined
let fail = false
api.defaults.adapter = async (config) => {
  if (config.method !== 'patch' || !config.url?.endsWith(`/messages/${message.id}`))
    throw new Error('Unexpected request')
  calls++
  if (fail) throw new Error('Edit failed')
  return new Promise<AxiosResponse>((resolve) => {
    finish = () =>
      resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          status: 'success',
          data: {
            ...message,
            text: JSON.parse(config.data).text,
            editedAt: new Date().toISOString(),
            revision: 2,
          },
        },
      })
  })
}
const container = document.createElement('div')
document.body.append(container)
const root = createRoot(container)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, action: () => Promise<void>) {
  try {
    await action()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  ensure(found, `Missing ${selector}`)
  return found
}
let displayedMessageId = message.id
async function render(value: ChatMessage, others: ChatMessage[] = []) {
  displayedMessageId = value.id
  await act(async () =>
    root.render(
      <Provider store={store}>
        {[value, ...others].map((item) => (
          <div key={item.id} data-edit-test-id={item.id}>
            <MessageActions message={item} />
          </div>
        ))}
        <EditMessageDialog
          conversation={{
            ...mockConversations[0],
            id: value.conversationId,
            sessionId: value.sessionId,
            messages: [value, ...others],
          }}
        />
      </Provider>,
    ),
  )
}
async function menu(id = displayedMessageId) {
  await act(async () =>
    element<HTMLButtonElement>(
      `[data-edit-test-id="${id}"] [aria-label="Ações da mensagem"]`,
    ).dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      }),
    ),
  )
}
function editOption() {
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (node) => node.textContent?.trim() === 'Editar mensagem',
  )
}
async function open(id = displayedMessageId) {
  await menu(id)
  const option = editOption()
  ensure(option, 'Edit action is missing')
  await act(async () => option.click())
}
async function input(value: string) {
  const textarea = element<HTMLTextAreaElement>('textarea')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      textarea,
      value,
    )
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
await check('only own text and text replies expose edit', async () => {
  for (const value of [
    mockMessage(901, message.conversationId),
    { ...message, type: 'image' as const },
    { ...message, type: 'audio' as const },
    { ...message, interactive: { title: null, footer: null, buttons: [] } },
  ]) {
    await render(value)
    await menu()
    ensure(!editOption(), 'Unsupported message exposes edit')
    await act(async () => root.render(null))
  }
  await render({ ...message, replyTo: null })
  await menu()
  ensure(editOption(), 'Own plain text cannot be edited')
  await act(async () => root.render(null))
  await render(message)
  await open()
})
await check('opens a focused prefilled modal with original text and quoted preview', async () => {
  const dialog = element<HTMLElement>('[role="dialog"]')
  ensure(dialog.textContent?.includes('Editar mensagem'), 'Missing title')
  ensure(dialog.textContent?.includes('Resposta original'), 'Missing original preview')
  ensure(dialog.textContent?.includes('Mensagem citada'), 'Missing quoted preview')
  ensure(element<HTMLTextAreaElement>('textarea').value === message.text, 'Input is not prefilled')
  ensure(document.activeElement === document.querySelector('textarea'), 'Input is not focused')
  ensure(
    element<HTMLButtonElement>('[aria-label="Salvar edição"]').disabled,
    'Unchanged text is enabled',
  )
})
await check('blocks blank text, validates maximum length and preserves newlines', async () => {
  await input(' \n ')
  ensure(
    element<HTMLButtonElement>('[aria-label="Salvar edição"]').disabled,
    'Blank text is enabled',
  )
  ensure(document.querySelector('[role="alert"]'), 'Validation error is missing')
  await input('Nova resposta\nsegunda linha')
  ensure(
    !element<HTMLButtonElement>('[aria-label="Salvar edição"]').disabled,
    'Changed text cannot be saved',
  )
  ensure(element<HTMLTextAreaElement>('textarea').maxLength === 65536, 'Wrong maximum length')
  ensure(calls === 0, 'Typing sent a request')
})
await check('failed edits keep the modal and draft', async () => {
  fail = true
  await act(async () => element<HTMLButtonElement>('[aria-label="Salvar edição"]').click())
  ensure(calls === 1, 'Missing failed request')
  ensure(document.querySelector('[role="dialog"]'), 'Modal closed after failure')
  ensure(
    element<HTMLTextAreaElement>('textarea').value === 'Nova resposta\nsegunda linha',
    'Draft lost after failure',
  )
  fail = false
})
await check('submission locks controls and escape without duplicate requests', async () => {
  await act(async () => element<HTMLButtonElement>('[aria-label="Salvar edição"]').click())
  ensure(calls === 2, 'Missing save request')
  ensure(
    element<HTMLButtonElement>('[aria-label="Salvando edição"]').disabled,
    'Save is not locked',
  )
  ensure(element<HTMLTextAreaElement>('textarea').disabled, 'Input is not locked')
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    element<HTMLButtonElement>('[aria-label="Salvando edição"]').click()
  })
  ensure(document.querySelector('[role="dialog"]'), 'Escape closed pending edit')
  ensure(calls === 2, 'Duplicate request')
})
await check(
  'success closes modal and replaces original cached message preserving reply',
  async () => {
    ensure(finish, 'Missing pending response')
    await act(async () => finish?.())
    ensure(!document.querySelector('[role="dialog"]'), 'Modal remains open after success')
    const cached = store.get(chatLiveCacheAtom).messages
    ensure(cached.length === 1 && cached[0].id === message.id, 'Original message was duplicated')
    ensure(cached[0].text === 'Nova resposta\nsegunda linha', 'Text is stale')
    ensure(cached[0].replyTo?.messageId === message.replyTo?.messageId, 'Quote lost')
    ensure(cached[0].editedAt, 'Missing edited marker')
  },
)
await check('cancel discards the edit without sending', async () => {
  await open()
  await input('Descartar')
  await act(async () => element<HTMLButtonElement>('[data-slot="dialog-close"]').click())
  ensure(!document.querySelector('[role="dialog"]'), 'Cancel did not close')
  ensure(calls === 2, 'Cancel sent a request')
  await open()
  ensure(element<HTMLTextAreaElement>('textarea').value === message.text, 'Canceled draft remains')
})
await check(
  'one shared dialog handles multiple messages and survives removal of the menu source',
  async () => {
    await act(async () => element<HTMLButtonElement>('[data-slot="dialog-close"]').click())
    const other = mockMessage(902, message.conversationId, { fromMe: true, text: 'Outra mensagem' })
    await render(message, [other])
    ensure(!document.querySelector('[role="dialog"]'), 'Closed dialogs remain mounted')
    await open(other.id)
    ensure(document.querySelectorAll('[role="dialog"]').length === 1, 'More than one edit dialog')
    ensure(store.get(chatEditMessageAtom)?.id === other.id, 'Wrong shared selection')
    ensure(
      element<HTMLTextAreaElement>('textarea').value === other.text,
      'Wrong message in shared dialog',
    )
    await act(async () => element<HTMLButtonElement>('[data-slot="dialog-close"]').click())
    await open(message.id)
    await input('Rascunho compartilhado')
    await render(other)
    ensure(
      document.querySelectorAll('[role="dialog"]').length === 1,
      'Dialog was owned by the unmounted menu',
    )
    ensure(
      element<HTMLTextAreaElement>('textarea').value === 'Rascunho compartilhado',
      'Menu unmount lost the edit draft',
    )
  },
)
await check(
  'changing conversation or session and leaving chat clears the shared selection',
  async () => {
    await render({ ...message, conversationId: mockConversations[1].id })
    ensure(!document.querySelector('[role="dialog"]'), 'Dialog leaked across conversations')
    ensure(store.get(chatEditMessageAtom) === null, 'Conversation change kept the selection')
    await render(message)
    await open()
    await render({ ...message, sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    ensure(!document.querySelector('[role="dialog"]'), 'Dialog leaked across sessions')
    ensure(store.get(chatEditMessageAtom) === null, 'Session change kept the selection')
    await render(message)
    await open()
    await act(async () => root.render(null))
    ensure(store.get(chatEditMessageAtom) === null, 'Leaving chat kept the selection')
    ensure(calls === 2, 'Scope changes sent unexpected edits')
  },
)
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
