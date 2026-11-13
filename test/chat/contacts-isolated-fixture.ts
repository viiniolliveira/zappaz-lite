import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { createStore } from 'jotai/vanilla'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'

let resolveSave: ((value: unknown) => void) | undefined
mock.module('../../src/services/chat.ts', () => ({
  saveChatContact: () => new Promise(resolve => { resolveSave = resolve }),
  updateChatContact: () => { throw new Error('Unexpected update') },
  deleteChatContact: () => { throw new Error('Unexpected delete') },
  getChatContacts: () => { throw new Error('Unexpected query') },
  findSavedChatContact: () => { throw new Error('Unexpected query') },
  openChatConversation: () => { throw new Error('Unexpected conversation') },
  getChatConversations: () => { throw new Error('Unexpected query') },
  getChatMessages: () => { throw new Error('Unexpected query') },
  getChatConversation: () => { throw new Error('Unexpected query') },
}))
mock.module('sonner', () => ({ toast: { success: () => {}, error: () => {} } }))
const ui = await import('../../src/atoms/ui.ts')
const cache = await import('../../src/atoms/chat-cache.ts')
const agenda = await import('../../src/atoms/chat-contacts.ts')
const { mockConversations, mockSessionId } = await import('./mock-data.ts')
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
store.set(queryClientAtom, client)
store.set(ui.chatSessionIdAtom, mockSessionId)
store.set(ui.chatContactFormAtom, { surface: 'dialog', name: '', phoneNumber: '', saved: false })
const pending = store.set(agenda.submitChatContactAtom, { name: 'A', phoneNumber: '5511999999999' })
await Promise.resolve()
assert.ok(resolveSave)
const nextSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
store.set(ui.chatSessionIdAtom, nextSession)
store.set(ui.chatContactFormAtom, { surface: 'dialog', name: 'Other session', phoneNumber: '', saved: false })
resolveSave({ ...mockConversations[0]!.contact!, sessionId: mockSessionId, isSaved: true, localName: 'A' })
assert.equal(await pending, true)
assert.deepEqual(store.get(cache.chatLiveCacheAtom).contacts, [])
assert.equal(store.get(ui.chatContactFormAtom)?.name, 'Other session')
client.clear()
