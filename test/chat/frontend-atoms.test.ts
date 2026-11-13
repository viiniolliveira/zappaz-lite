import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai/vanilla'
import { applyChatConversationsAtom, applyChatMessagesAtom, chatAccessDeniedAtom, chatLiveCacheAtom, chatOptimisticMessagesAtom, chatConnectionStatusAtom, chatSessionStateAtom } from '../../src/atoms/chat-cache.ts'
import { sendApiChatTextAtom } from '../../src/atoms/chat-send.ts'
import { chatSessionIdAtom } from '../../src/atoms/ui.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'
import { sharedContactQueryAtom, sharedSavedContactAtom } from '../../src/atoms/chat-contacts.ts'
import { chatContactQueryAtom } from '../../src/atoms/ui.ts'
import { queryClientAtom } from 'jotai-tanstack-query'
import { QueryClient } from '@tanstack/react-query'
import { chatKeys } from '../../src/lib/chat/merge.ts'

const foreignSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const conversationId = mockConversations[0].id

describe('chat cache atoms', () => {
  test('shared contact lookup is independent of agenda filter and follows live updates scoped to the session', () => {
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    store.set(queryClientAtom, client)
    store.set(chatSessionIdAtom, mockSessionId)
    store.set(chatContactQueryAtom, 'outro filtro')
    const contact = { ...mockConversations[0].contact!, phoneNumber: '5511999999999', isSaved: true }
    const phone = contact.phoneNumber
    client.setQueryData([...chatKeys.contacts(mockSessionId), 'shared', phone], null)
    expect(store.get(sharedContactQueryAtom(phone)).data).toBeNull()
    expect(store.get(sharedSavedContactAtom(phone))).toBeNull()
    store.set(chatLiveCacheAtom, { contacts: [contact], conversations: [], messages: [] })
    expect(store.get(sharedSavedContactAtom(phone))).toEqual(contact)
    store.set(chatLiveCacheAtom, { contacts: [{ ...contact, isSaved: false, revision: contact.revision + 1 }], conversations: [], messages: [] })
    expect(store.get(sharedSavedContactAtom(phone))).toBeNull()
    client.setQueryData([...chatKeys.contacts(mockSessionId), 'shared', phone], contact)
    expect(store.get(sharedSavedContactAtom(phone))).toBeNull()
    store.set(chatSessionIdAtom, foreignSession)
    expect(store.get(sharedSavedContactAtom(phone))).toBeNull()
    store.set(chatAccessDeniedAtom, true)
    expect(store.get(sharedSavedContactAtom(phone))).toBeNull()
    client.clear()
  })
  test('merges revisions independently of arrival order and filters foreign sessions', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, mockSessionId)
    const base = mockMessage(1, conversationId)
    const event = { ...base, revision: 3, text: 'event' }
    const stale = { ...base, revision: 2, text: 'snapshot' }
    const foreign = { ...mockMessage(2, conversationId), sessionId: foreignSession }
    store.set(applyChatMessagesAtom, [event, foreign])
    store.set(applyChatMessagesAtom, [stale])
    expect(store.get(chatLiveCacheAtom).messages).toEqual([event])
    const conversation = mockConversations[0]
    store.set(applyChatConversationsAtom, [{ ...conversation, revision: 3, displayName: 'event' }])
    store.set(applyChatConversationsAtom, [{ ...conversation, revision: 2, displayName: 'snapshot' }, { ...conversation, sessionId: foreignSession }])
    expect(store.get(chatLiveCacheAtom).conversations).toHaveLength(1)
    expect(store.get(chatLiveCacheAtom).conversations[0].displayName).toBe('event')
  })

  test('only reconciles optimistic messages with matching session, conversation and request ID', () => {
    const store = createStore()
    store.set(chatSessionIdAtom, mockSessionId)
    const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const pending = { ...mockMessage(1, conversationId), clientRequestId: requestId, localStatus: 'sending' as const }
    const other = { ...pending, conversationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }
    store.set(chatOptimisticMessagesAtom, [pending, other])
    store.set(applyChatMessagesAtom, [{ ...pending, sessionId: foreignSession }])
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([pending, other])
    store.set(applyChatMessagesAtom, [{ ...pending, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }])
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([other])
  })

  test('ignores updates without a session or when access is denied', () => {
    const store = createStore()
    const message = mockMessage(1, conversationId)
    store.set(applyChatMessagesAtom, [message])
    store.set(chatSessionIdAtom, mockSessionId)
    store.set(chatAccessDeniedAtom, true)
    store.set(applyChatMessagesAtom, [message])
    store.set(applyChatConversationsAtom, [mockConversations[0]])
    expect(store.get(chatLiveCacheAtom)).toEqual({ contacts: [], conversations: [], messages: [] })
  })

  test('refuses to send offline, disabled, blank or oversized messages', async () => {
    const store = createStore()
    store.set(chatSessionIdAtom, mockSessionId)
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'hello' })).toBe(false)
    store.set(chatConnectionStatusAtom, 'open')
    store.set(chatSessionStateAtom, { connected: true, enabled: false, syncStatus: 'idle' })
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'hello' })).toBe(false)
    store.set(chatSessionStateAtom, { connected: true, enabled: true, syncStatus: 'idle' })
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: '  ' })).toBe(false)
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'x'.repeat(4097) })).toBe(false)
    expect(store.get(chatOptimisticMessagesAtom)).toEqual([])
  })
})
