import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { QueryClient } from '@tanstack/react-query'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'

const calls: string[][] = []
let outcome: 'complete' | 'pending' | 'fail' = 'complete'
const notices: string[] = []
mock.module('../../src/services/chat.ts', () => ({
  deleteChatConversation: async (session: string, id: string) => {
    calls.push([session, id])
    if (outcome === 'fail') throw new Error('falhou')
    return { conversationId: id, mediaCleanup: outcome }
  },
  getChatConversations: async () => {
    throw new Error('unexpected request')
  },
  getChatMessages: async () => {
    throw new Error('unexpected request')
  },
  getChatConversation: async () => {
    throw new Error('unexpected request')
  },
}))
mock.module('sonner', () => ({
  toast: {
    success: (s: string) => notices.push(`success:${s}`),
    warning: (s: string) => notices.push(`warning:${s}`),
    error: (s: string) => notices.push(`error:${s}`),
  },
}))
const cache = await import('../../src/atoms/chat-cache.ts')
const ui = await import('../../src/atoms/ui.ts')
const deletion = await import('../../src/atoms/chat-delete.ts')
const { mockConversations, mockMessage, mockSessionId: session } = await import('./mock-data.ts')
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
const [target, other] = mockConversations
const foreign = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const message = mockMessage(1, target.id)
const otherMessage = mockMessage(2, other.id)
const page = {
  pages: [{ status: 'success', data: [target, other], page: { hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
}
store.set(ui.chatSessionIdAtom, session)
store.set(ui.selectedChatIdAtom, target.id)
store.set(ui.chatDeleteConversationIdsAtom, [target.id])
store.set(ui.chatDraftsAtom, {
  [`${session}/${target.id}`]: 'draft',
  [`${session}/${other.id}`]: 'keep',
})
store.set(cache.chatLiveCacheAtom, {
  contacts: target.contact ? [target.contact] : [],
  conversations: [target, other],
  messages: [message, otherMessage],
})
store.set(cache.chatOptimisticMessagesAtom, [message, otherMessage])
client.setQueryData(cache.chatKeys.conversations(session), page)
client.setQueryData(cache.chatKeys.conversations(session, 'ana'), page)
client.setQueryData(cache.chatKeys.conversations(foreign), page)
client.setQueryData(cache.chatKeys.contacts(session), { keep: true })
client.setQueryData(cache.chatKeys.messages(session, target.id), { keep: false })
client.setQueryData(cache.chatKeys.conversation(session, target.id), target)
client.setQueryData(cache.chatKeys.messages(foreign, target.id), { keep: true })
const scenario = process.argv[2]
if (scenario === 'success' || scenario === 'pending') {
  outcome = scenario === 'pending' ? 'pending' : 'complete'
  assert.equal(await store.set(deletion.deleteChatConversationsAtom, [target.id]), true)
  assert.deepEqual(calls, [[session, target.id]])
  assert.match(notices[0], scenario === 'pending' ? /^warning:/ : /^success:/)
  assert.deepEqual(store.get(cache.chatLiveCacheAtom), {
    contacts: target.contact ? [target.contact] : [],
    conversations: [other],
    messages: [otherMessage],
  })
  assert.deepEqual(store.get(cache.chatOptimisticMessagesAtom), [otherMessage])
  assert.deepEqual(store.get(ui.chatDraftsAtom), { [`${session}/${other.id}`]: 'keep' })
  assert.equal(store.get(ui.selectedChatIdAtom), null)
  assert.deepEqual(store.get(ui.chatDeleteConversationIdsAtom), [])
  assert.equal(client.getQueryData(cache.chatKeys.messages(session, target.id)), undefined)
  assert.equal(client.getQueryData(cache.chatKeys.conversation(session, target.id)), undefined)
  for (const q of ['', 'ana'])
    assert.deepEqual(
      (client.getQueryData(cache.chatKeys.conversations(session, q)) as typeof page).pages[0].data,
      [other],
    )
  assert.deepEqual(client.getQueryData(cache.chatKeys.conversations(foreign)), page)
  assert.deepEqual(client.getQueryData(cache.chatKeys.messages(foreign, target.id)), { keep: true })
  assert.deepEqual(client.getQueryData(cache.chatKeys.contacts(session)), { keep: true })
  // Simulate stale responses after deletion and then a new conversation for the same contact.
  client.setQueryData(cache.chatKeys.conversations(session), page)
  client.setQueryData(cache.chatKeys.conversation(session, target.id), target)
  store.set(cache.applyChatConversationsAtom, [target, other])
  store.set(cache.applyChatMessagesAtom, [message])
  assert.equal(
    store.get(cache.apiChatConversationsAtom).some((item) => item.id === target.id),
    false,
  )
  assert.equal(
    store.get(cache.chatLiveCacheAtom).messages.some((item) => item.conversationId === target.id),
    false,
  )
  const replacement = { ...target, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
  store.set(cache.applyChatConversationsAtom, [replacement])
  assert.ok(store.get(cache.apiChatConversationsAtom).some((item) => item.id === replacement.id))
} else if (scenario === 'fail') {
  outcome = 'fail'
  assert.equal(await store.set(deletion.deleteChatConversationsAtom, [target.id]), false)
  assert.deepEqual(notices, ['error:falhou'])
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [target, other])
  assert.equal(store.get(ui.selectedChatIdAtom), target.id)
  assert.deepEqual(client.getQueryData(cache.chatKeys.conversations(session)), page)
  assert.deepEqual(store.get(cache.chatDeletedConversationIdsAtom), {})
} else if (scenario === 'no-session') {
  store.set(ui.chatSessionIdAtom, null)
  assert.equal(await store.set(deletion.deleteChatConversationsAtom, [target.id]), false)
  assert.deepEqual(calls, [])
  assert.deepEqual(notices, [])
} else if (scenario === 'foreign') {
  store.set(cache.forgetChatConversationAtom, { sessionId: foreign, conversationId: target.id })
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [target, other])
  assert.equal(store.get(ui.selectedChatIdAtom), target.id)
  assert.deepEqual(client.getQueryData(cache.chatKeys.conversations(session)), page)
}
client.clear()
