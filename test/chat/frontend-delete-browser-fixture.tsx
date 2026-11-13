import { QueryClient } from '@tanstack/react-query'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  chatConversationSelectionAtom,
  chatDeleteConversationIdsAtom,
  chatDraftsAtom,
  chatSessionIdAtom,
} from '../../src/atoms/ui'
import ConversationList from '../../src/components/chat/conversation-list'
import MessageComposer from '../../src/components/chat/message-composer'
import { api } from '../../src/lib/api-client'
import { mockConversations, mockSessionId } from './mock-data'
;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
const target = mockConversations[0]
const other = mockConversations[1]
let requests = 0
const readRequests: { id: string; read: boolean }[] = []
let finish: (() => void) | undefined
const adapter: AxiosAdapter = (config) => {
  if (config.method === 'patch') {
    const id = config.url?.split('/conversations/')[1]?.split('/')[0]
    const conversation = [target, other].find((item) => item.id === id)
    if (!conversation || !config.url?.endsWith('/read-state'))
      throw new Error('Unexpected read-state request')
    const { read } = JSON.parse(config.data)
    readRequests.push({ id: conversation.id, read })
    return Promise.resolve({
      config,
      data: {
        status: 'success',
        data: {
          ...conversation,
          unreadCount: read ? 0 : 1,
          revision: conversation.revision + readRequests.length,
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
    })
  }
  if (config.method !== 'delete') return Promise.reject(new Error('Unexpected read'))
  return new Promise<AxiosResponse>((resolve) => {
    requests++
    finish = () =>
      resolve({
        config,
        data: { status: 'success', data: { conversationId: target.id, mediaCleanup: 'complete' } },
        status: 200,
        statusText: 'OK',
        headers: {},
      })
  })
}
api.defaults.adapter = adapter
const root = createRoot(document.body)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}
function requireText(text: string) {
  if (!document.body.textContent?.includes(text)) throw new Error(`Missing text: ${text}`)
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (item) => item.textContent?.trim() === text,
  )
  if (!found) throw new Error(`Missing button ${text}`)
  return found
}
let selected = ''
function card(name: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('li button')].find((item) =>
    item.textContent?.includes(name),
  )
  if (!found) throw new Error(`Missing conversation card ${name}`)
  return found
}
async function openMenu(name: string) {
  await act(async () =>
    card(name).dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 40,
        clientY: 40,
      }),
    ),
  )
}
async function chooseAction(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent?.trim() === label,
  )
  if (!item) throw new Error(`Missing menu item ${label}`)
  await act(async () => item.click())
}
const chooseDelete = () => chooseAction('Excluir conversa')
async function openBatchMenu() {
  const trigger = requireElement<HTMLButtonElement>(
    'button[aria-label="Ações das conversas selecionadas"]',
  )
  await act(async () => {
    trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
    trigger.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
    trigger.click()
  })
}
await act(async () =>
  root.render(
    createElement(
      Provider,
      { store },
      createElement(ConversationList, {
        conversations: [target, other],
        selectedId: other.id,
        onSelect: (id) => {
          selected = id
        },
      }),
    ),
  ),
)
await check('normal click selects and selected card is marked without inline delete', async () => {
  if (card(other.displayName).getAttribute('aria-current') !== 'true')
    throw new Error('Selected card is not marked')
  if (document.querySelector('button[aria-label^="Excluir conversa com"]'))
    throw new Error('Inline delete button remains')
  await act(async () => card(other.displayName).click())
  if (selected !== other.id || requests) throw new Error('Normal click did not select safely')
})
await check('draft preview is reactive and shown only on closed conversations', async () => {
  const original = card(target.displayName).textContent
  await act(async () =>
    store.set(chatDraftsAtom, {
      [`${mockSessionId}/${target.id}`]: 'Texto\n  pendente',
      [`${mockSessionId}/${other.id}`]: 'Conversa aberta',
    }),
  )
  if (!card(target.displayName).textContent?.includes('Rascunho: Texto pendente'))
    throw new Error('Closed conversation draft is missing')
  if (card(other.displayName).textContent?.includes('Rascunho:'))
    throw new Error('Open conversation shows a draft preview')
  await act(async () => store.set(chatDraftsAtom, { [`${mockSessionId}/${target.id}`]: '  \n ' }))
  if (card(target.displayName).textContent !== original)
    throw new Error('Whitespace draft replaced the last message')
  await act(async () => store.set(chatDraftsAtom, {}))
})
await check('selection menu replaces filters and card clicks toggle without opening', async () => {
  selected = ''
  await openMenu(target.displayName)
  await chooseAction('Selecionar conversa')
  requireText('1 selecionada')
  if (document.querySelector('fieldset[aria-label="Filtrar conversas"]'))
    throw new Error('Filters remain in selection mode')
  if (card(target.displayName).getAttribute('aria-pressed') !== 'true')
    throw new Error('First conversation not selected')
  await act(async () => card(other.displayName).click())
  requireText('2 selecionadas')
  if (selected || requests) throw new Error('Selection opened or deleted a conversation')
  await act(async () => card(target.displayName).click())
  requireText('1 selecionada')
  if (card(target.displayName).getAttribute('aria-pressed') !== 'false')
    throw new Error('Card not deselected')
  await act(async () =>
    requireElement<HTMLButtonElement>('button[aria-label="Fechar seleção de conversas"]').click(),
  )
  if (
    store.get(chatConversationSelectionAtom) ||
    !document.querySelector('fieldset[aria-label="Filtrar conversas"]')
  )
    throw new Error('Close did not restore filters')
})
await check('individual menu exposes local read and unread actions', async () => {
  await openMenu(target.displayName)
  await chooseAction('Marcar como não lida')
  await openMenu(other.displayName)
  await chooseAction('Marcar como lida')
  if (
    JSON.stringify(readRequests) !==
    JSON.stringify([
      { id: target.id, read: false },
      { id: other.id, read: true },
    ])
  )
    throw new Error('Wrong read-state requests')
})
await check('batch menu marks both conversations and closes selection', async () => {
  await openMenu(target.displayName)
  await chooseAction('Selecionar conversa')
  await act(async () => card(other.displayName).click())
  await openBatchMenu()
  await chooseAction('Marcar como não lidas')
  if (store.get(chatConversationSelectionAtom)) throw new Error('Batch success kept selection')
  if (readRequests.length !== 4 || !readRequests.slice(2).every((item) => !item.read))
    throw new Error('Batch did not mark both as unread')
})
await check('batch delete asks confirmation and cancel preserves selection', async () => {
  await openMenu(target.displayName)
  await chooseAction('Selecionar conversa')
  await act(async () => card(other.displayName).click())
  await openBatchMenu()
  await chooseAction('Excluir selecionadas')
  requireText('Excluir 2 conversas?')
  requireText('Os contatos serão mantidos')
  if (requests) throw new Error('Batch delete skipped confirmation')
  await act(async () => button('Cancelar').click())
  if (store.get(chatConversationSelectionAtom)?.ids.length !== 2)
    throw new Error('Cancel lost selection')
  await act(async () =>
    requireElement<HTMLButtonElement>('button[aria-label="Fechar seleção de conversas"]').click(),
  )
})
await check('right click opens named menu without selecting or deleting', async () => {
  selected = ''
  await openMenu(target.displayName)
  const menu = requireElement<HTMLElement>('[role="menu"]')
  if (menu.getAttribute('aria-label') !== `Ações da conversa com ${target.displayName}`)
    throw new Error('Menu has incorrect accessible name')
  if (
    selected ||
    requests ||
    store.get(chatDeleteConversationIdsAtom).length ||
    document.querySelector('[role="dialog"]')
  )
    throw new Error('Right click selected or deleted conversation')
})
await check('menu item opens the correct confirmation without selecting', async () => {
  await chooseDelete()
  if (selected || requests || store.get(chatDeleteConversationIdsAtom)[0] !== target.id)
    throw new Error('Menu item selected or deleted conversation')
  const dialog = requireElement<HTMLElement>('[role="dialog"]')
  if (!dialog.getAttribute('aria-labelledby') || !dialog.getAttribute('aria-describedby'))
    throw new Error('Dialog lacks accessible title or description')
  if (
    !dialog.textContent?.includes(target.displayName) ||
    dialog.textContent.includes(other.displayName)
  )
    throw new Error('Dialog identifies the wrong conversation')
  for (const text of [
    'Excluir conversa?',
    target.displayName,
    'histórico e todas as mídias',
    'excluídos permanentemente do Zappaz',
    'O contato será mantido',
    'nada será apagado no WhatsApp',
    'Esta ação não pode ser desfeita',
  ])
    requireText(text)
})
await check('cancel closes without deletion', async () => {
  await act(async () => button('Cancelar').click())
  if (store.get(chatDeleteConversationIdsAtom).length || requests !== 0)
    throw new Error('Cancel did not close safely')
})
await check('confirmation starts one request and locks actions while pending', async () => {
  await openMenu(target.displayName)
  await chooseDelete()
  await act(async () => button('Excluir conversa').click())
  if (requests !== 1 || !finish) throw new Error('Confirmation did not issue exactly one request')
  if (!button('Cancelar').disabled || !button('Excluindo…').disabled)
    throw new Error('Pending actions not disabled')
  await act(async () => {
    button('Cancelar').click()
    button('Excluindo…').click()
  })
  if (requests !== 1 || store.get(chatDeleteConversationIdsAtom)[0] !== target.id)
    throw new Error('Pending action escaped lock')
  await act(async () => {
    finish?.()
    await Promise.resolve()
  })
  if (store.get(chatDeleteConversationIdsAtom).length)
    throw new Error('Success did not close dialog')
})
await check(
  'composer preserves failed sends, clears confirmed sends and protects newer text',
  async () => {
    const draftKey = `${mockSessionId}/${target.id}`
    let outcome = false
    let complete: ((sent: boolean) => void) | undefined
    let pending = false
    await act(async () => {
      store.set(chatDraftsAtom, { [draftKey]: 'Texto pendente' })
      root.render(
        createElement(
          Provider,
          { store },
          createElement(MessageComposer, {
            draftKey,
            onAttach: () => true,
            onSend: () =>
              pending
                ? new Promise<boolean>((resolve) => {
                    complete = resolve
                  })
                : outcome,
          }),
        ),
      )
    })
    const send = () =>
      requireElement<HTMLButtonElement>('button[aria-label="Enviar mensagem"]').click()
    await act(async () => send())
    if (store.get(chatDraftsAtom)[draftKey] !== 'Texto pendente')
      throw new Error('Failed send discarded draft')
    outcome = true
    await act(async () => send())
    if (draftKey in store.get(chatDraftsAtom)) throw new Error('Confirmed send retained draft')
    await act(async () => store.set(chatDraftsAtom, { [draftKey]: 'Primeiro texto' }))
    pending = true
    await act(async () => send())
    await act(async () => store.set(chatDraftsAtom, { [draftKey]: 'Texto novo' }))
    await act(async () => complete?.(true))
    if (store.get(chatDraftsAtom)[draftKey] !== 'Texto novo')
      throw new Error('Confirmed send discarded newer draft')
    await act(async () => store.set(chatDraftsAtom, {}))
  },
)
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
