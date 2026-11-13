import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { QueryClient } from '@tanstack/react-query'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const notices: string[] = []
mock.module('sonner', () => ({
  toast: {
    success: (message: string) => notices.push(`success:${message}`),
    warning: (message: string) => notices.push(`warning:${message}`),
    error: (message: string) => notices.push(`error:${message}`),
  },
}))
const ui = await import('../../src/atoms/ui.ts')
const cache = await import('../../src/atoms/chat-cache.ts')
const read = await import('../../src/atoms/chat-read.ts')
const deletion = await import('../../src/atoms/chat-delete.ts')
const [first, second] = mockConversations
const ids = [first.id, second.id]
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(ui.chatSessionIdAtom, mockSessionId)
store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [first, second], messages: [] })
const calls: { method: string | undefined; url: string | undefined; body: unknown }[] = []
let failId: string | null = null
let delay: (() => Promise<void>) | null = null
api.defaults.adapter = async (config) => {
  const id = config.url?.split('/conversations/')[1]?.split('/')[0]
  const conversation = [first, second].find((item) => item.id === id)
  assert.ok(conversation)
  const body = config.data ? JSON.parse(config.data) : null
  calls.push({ method: config.method, url: config.url, body })
  if (delay) await delay()
  if (id === failId) throw new Error('Request failed')
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 'success',
      data:
        config.method === 'delete'
          ? { conversationId: id, mediaCleanup: 'complete' }
          : {
              ...conversation,
              unreadCount: body.read ? 0 : 1,
              lastReadMessageRecordId: null,
              revision: conversation.revision + calls.length + 10,
            },
    },
  }
}

// Batch updates use only the local endpoints and merge returned revisions immediately.
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(read.setChatReadStateAtom, { conversationIds: [...ids, first.id], read: true }),
  true,
)
assert.equal(calls.length, 2)
assert.ok(
  calls.every(
    (call) =>
      call.method === 'patch' &&
      call.url?.endsWith('/read-state') &&
      JSON.stringify(call.body) === '{"read":true}',
  ),
)
assert.ok(store.get(cache.chatLiveCacheAtom).conversations.every((item) => item.unreadCount === 0))
assert.equal(store.get(ui.chatConversationSelectionAtom), null)

// Manual unread closes the open panel, avoiding immediate automatic read-on-open.
store.set(ui.selectedChatIdAtom, first.id)
assert.equal(
  await store.set(read.setChatReadStateAtom, { conversationIds: [first.id], read: false }),
  true,
)
assert.equal(store.get(ui.selectedChatIdAtom), null)
assert.equal(
  store.get(cache.chatLiveCacheAtom).conversations.find((item) => item.id === first.id)
    ?.unreadCount,
  1,
)

// Partial read failures leave only the failed conversations selected.
failId = second.id
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(read.setChatReadStateAtom, { conversationIds: ids, read: true }),
  false,
)
assert.deepEqual(store.get(ui.chatConversationSelectionAtom)?.ids, [second.id])
assert.ok(notices.some((notice) => notice.startsWith('error:')))

// Partial deletions remove only successful conversations and preserve failed targets.
store.set(ui.chatDeleteConversationIdsAtom, ids)
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(await store.set(deletion.deleteChatConversationsAtom, [...ids, first.id]), false)
assert.deepEqual(
  store.get(cache.chatLiveCacheAtom).conversations.map((item) => item.id),
  [second.id],
)
assert.deepEqual(store.get(ui.chatDeleteConversationIdsAtom), [second.id])
assert.deepEqual(store.get(ui.chatConversationSelectionAtom)?.ids, [second.id])
assert.equal(calls.filter((call) => call.method === 'delete').length, 2)

// A session change during an in-flight operation cannot overwrite the new session.
failId = null
let release: (() => void) | undefined
delay = () =>
  new Promise<void>((resolve) => {
    release = resolve
  })
const pending = store.set(read.setChatReadStateAtom, { conversationIds: [second.id], read: false })
for (let attempt = 0; !release && attempt < 100; attempt++) await Bun.sleep(1)
assert.ok(release)
const foreignSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
store.set(ui.chatSessionIdAtom, foreignSession)
store.set(ui.chatConversationSelectionAtom, { sessionId: foreignSession, ids: ['foreign'] })
store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [], messages: [] })
release()
assert.equal(await pending, true)
assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [])
assert.deepEqual(store.get(ui.chatConversationSelectionAtom), {
  sessionId: foreignSession,
  ids: ['foreign'],
})

store.set(ui.chatSessionIdAtom, null)
const before = calls.length
assert.equal(
  await store.set(read.setChatReadStateAtom, { conversationIds: ids, read: false }),
  false,
)
assert.equal(await store.set(deletion.deleteChatConversationsAtom, ids), false)
assert.equal(calls.length, before)
client.clear()
