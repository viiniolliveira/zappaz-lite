import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  chatAccessDeniedAtom,
  chatSessionStateAtom,
  chatSubscribedSessionIdAtom,
} from '../../src/atoms/chat-cache'
import { sessionKeys } from '../../src/atoms/session'
import {
  chatBulkLabelsOpenAtom,
  chatContactFormAtom,
  chatContactPanelAtom,
  chatConversationSelectionAtom,
  chatDeleteContactAtom,
  chatDeleteConversationIdsAtom,
  chatLabelFilterAtom,
  chatLabelManagerAtom,
  chatLabelTargetAtom,
  chatSessionIdAtom,
  selectedChatIdAtom,
} from '../../src/atoms/ui'
import ChatSessionPicker from '../../src/components/chat/chat-session-picker'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
store.set(queryClientAtom, client)
client.setQueryData(sessionKeys.list(), {
  data: [
    { id: 'one', displayName: 'Principal', enabled: true, status: 'open', profilePictureUrl: null },
    { id: 'two', displayName: 'Suporte', enabled: true, status: 'close', profilePictureUrl: null },
    {
      id: 'disabled',
      displayName: 'Inativa',
      enabled: false,
      status: 'open',
      profilePictureUrl: null,
    },
  ],
})
const container = document.getElementById('root')
if (!container) throw new Error('Missing root element')
const root = createRoot(container)
const results: { name: string; ok: boolean; error?: string }[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (e) {
    results.push({ name, ok: false, error: String(e) })
  }
}
function trigger() {
  const el = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
  assert(el, 'menu trigger not found')
  return el
}
async function open() {
  await act(async () => {
    trigger().dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
    )
  })
}
async function choose(name: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
    el.textContent?.includes(name),
  )
  assert(item, `missing item ${name}`)
  await act(async () => item.click())
}
function seed() {
  store.set(selectedChatIdAtom, 'chat')
  store.set(chatContactFormAtom, { surface: 'dialog', name: 'N', phoneNumber: '1', saved: false })
  store.set(chatContactPanelAtom, {
    sessionId: 'one',
    conversationId: 'chat',
    mediaMessageId: null,
  })
  store.set(chatDeleteContactAtom, { id: 'c', displayName: 'N' })
  store.set(chatConversationSelectionAtom, { sessionId: 'one', ids: ['chat'] })
  store.set(chatDeleteConversationIdsAtom, ['chat'])
  store.set(chatLabelFilterAtom, 'label')
  store.set(chatLabelManagerAtom, 'list')
  store.set(chatLabelTargetAtom, 'chat')
  store.set(chatBulkLabelsOpenAtom, true)
  store.set(chatAccessDeniedAtom, true)
}
function retained() {
  return (
    store.get(selectedChatIdAtom) === 'chat' &&
    store.get(chatContactFormAtom)?.name === 'N' &&
    store.get(chatContactPanelAtom)?.conversationId === 'chat' &&
    store.get(chatDeleteContactAtom)?.id === 'c' &&
    store.get(chatConversationSelectionAtom)?.ids[0] === 'chat' &&
    store.get(chatDeleteConversationIdsAtom)[0] === 'chat' &&
    store.get(chatLabelFilterAtom) === 'label' &&
    store.get(chatLabelManagerAtom) === 'list' &&
    store.get(chatLabelTargetAtom) === 'chat' &&
    store.get(chatBulkLabelsOpenAtom) &&
    store.get(chatAccessDeniedAtom)
  )
}
function cleared() {
  return (
    store.get(selectedChatIdAtom) === null &&
    store.get(chatContactFormAtom) === null &&
    store.get(chatContactPanelAtom) === null &&
    store.get(chatDeleteContactAtom) === null &&
    store.get(chatConversationSelectionAtom) === null &&
    store.get(chatDeleteConversationIdsAtom).length === 0 &&
    store.get(chatLabelFilterAtom) === null &&
    store.get(chatLabelManagerAtom) === null &&
    store.get(chatLabelTargetAtom) === null &&
    !store.get(chatBulkLabelsOpenAtom) &&
    !store.get(chatAccessDeniedAtom)
  )
}
await act(async () =>
  root.render(createElement(Provider, { store }, createElement(ChatSessionPicker))),
)
await check('placeholder without selected session', async () => {
  assert(trigger().textContent?.includes('Selecione uma sessão'), 'missing placeholder')
  assert(!document.querySelector('label'), 'unexpected external label')
})
await check('enabled sessions are available and disabled sessions excluded', async () => {
  await open()
  const menu = document.querySelector('[role="menu"]')
  assert(menu?.textContent?.includes('Sessões'), 'missing menu label')
  const items = [...document.querySelectorAll('[role="menuitem"]')]
  assert(items.length === 2, `unexpected items: ${items.length}`)
  assert(
    items[0]?.textContent?.includes('Principal') && items[1]?.textContent?.includes('Suporte'),
    'missing session names',
  )
  assert(!menu.textContent?.includes('Inativa'), 'disabled session shown')
  await choose('Principal')
  assert(store.get(chatSessionIdAtom) === 'one', 'selection did not change')
  assert(
    trigger().getAttribute('aria-label') === 'Sessão do chat: Principal, conectada',
    'incorrect connected label',
  )
})
await check('reselecting current session preserves chat state', async () => {
  await act(async () => seed())
  await open()
  const items = [...document.querySelectorAll('[role="menuitem"]')]
  assert(
    items[0]?.querySelector('[aria-label="Sessão selecionada"]') &&
      !items[1]?.querySelector('[aria-label="Sessão selecionada"]'),
    'incorrect active check',
  )
  await choose('Principal')
  assert(retained(), 'same session cleared state')
})
await check('realtime state applies only to subscribed selected session', async () => {
  await act(async () => {
    store.set(chatSubscribedSessionIdAtom, 'one')
    store.set(chatSessionStateAtom, { connected: false, enabled: true, syncStatus: 'idle' })
  })
  assert(
    trigger().getAttribute('aria-label') === 'Sessão do chat: Principal, desconectada',
    'realtime status ignored',
  )
  await act(async () => store.set(chatSubscribedSessionIdAtom, 'two'))
  assert(
    trigger().getAttribute('aria-label') === 'Sessão do chat: Principal, conectada',
    'other subscription affected selected status',
  )
})
await check('switching sessions clears chat-specific state', async () => {
  await open()
  await choose('Suporte')
  assert(store.get(chatSessionIdAtom) === 'two', 'session not changed')
  assert(cleared(), 'session state not cleared')
  assert(
    trigger().getAttribute('aria-label') === 'Sessão do chat: Suporte, desconectada',
    'incorrect disconnected label',
  )
})
await check('no enabled sessions disables the trigger', async () => {
  await act(async () =>
    client.setQueryData(sessionKeys.list(), {
      data: [
        {
          id: 'disabled',
          displayName: 'Inativa',
          enabled: false,
          status: 'open',
          profilePictureUrl: null,
        },
      ],
    }),
  )
  assert(trigger().disabled, 'trigger should be disabled')
  assert(trigger().textContent?.includes('Nenhuma sessão disponível'), 'missing empty state')
})
await act(async () => root.unmount())
client.clear()
document.body.textContent = JSON.stringify(results)
