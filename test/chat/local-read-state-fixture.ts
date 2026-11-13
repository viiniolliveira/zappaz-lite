import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const sessionId = 'session-a'
const conversationId = '00000000-0000-4000-8000-000000000001'
const message = {
  id: '00000000-0000-4000-8000-000000000002',
  orderAt: new Date('2026-11-06T12:00:00Z'),
}
const state = {
  id: conversationId,
  sessionId,
  isGroup: false,
  unreadCount: 0,
  lastReadMessageId: message.id as string | null,
  lastReadOrderAt: message.orderAt as Date | null,
  revision: 1,
}
let hasMessages = true
let failUpdate = false
let committed = false
const events: unknown[] = []
const tx = {
  waConversation: {
    findFirst: async ({ where }: { where: { sessionId: string; id: string; isGroup: boolean } }) =>
      where.sessionId === state.sessionId &&
      where.id === state.id &&
      where.isGroup === state.isGroup
        ? { ...state }
        : null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string }
      data: {
        unreadCount: number
        lastReadMessageId: string | null
        lastReadOrderAt: Date | null
        revision: { increment: number }
      }
    }) => {
      assert.equal(where.id, conversationId)
      if (failUpdate) throw new Error('Database failed')
      Object.assign(state, { ...data, revision: state.revision + data.revision.increment })
    },
  },
  waMessage: {
    findFirst: async ({
      where,
      orderBy,
    }: {
      where: { sessionId: string; conversationId: string }
      orderBy?: unknown
    }) => {
      assert.deepEqual(where, { sessionId, conversationId })
      if (orderBy) assert.deepEqual(orderBy, [{ orderAt: 'desc' }, { id: 'desc' }])
      return hasMessages ? message : null
    },
  },
}
mock.module('../../server/src/db/prisma.ts', () => ({ prisma: {} }))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  privateJid: () => true,
  chatTransaction: async (_session: string, fn: (transaction: typeof tx) => Promise<void>) => {
    committed = false
    await fn(tx)
    committed = true
  },
}))
mock.module('../../server/src/lib/chat-dto.ts', () => ({
  conversationDTO: async () => ({ ...state, lastReadMessageRecordId: state.lastReadMessageId }),
}))
mock.module('../../server/src/lib/chat-events.ts', () => ({
  publishChatChange: (event: unknown) => {
    assert.equal(committed, true)
    events.push(event)
  },
}))
const { setConversationReadState } = await import(
  '../../server/src/modules/conversations/service.ts'
)
await setConversationReadState(sessionId, conversationId, false)
assert.equal(state.unreadCount, 1)
assert.equal(state.lastReadMessageId, null)
assert.equal(state.lastReadOrderAt, null)
assert.equal(state.revision, 2)
await setConversationReadState(sessionId, conversationId, false)
assert.equal(state.unreadCount, 1)
state.unreadCount = 8
await setConversationReadState(sessionId, conversationId, false)
assert.equal(state.unreadCount, 8)
await setConversationReadState(sessionId, conversationId, true)
assert.equal(state.unreadCount, 0)
assert.equal(state.lastReadMessageId, message.id)
assert.equal(state.lastReadOrderAt, message.orderAt)
assert.deepEqual(
  events,
  Array.from({ length: 4 }, () => ({ sessionId, conversationId })),
)
for (const read of [true, false]) {
  await assert.rejects(
    () => setConversationReadState('foreign', conversationId, read),
    /not found/i,
  )
  await assert.rejects(() => setConversationReadState(sessionId, 'missing', read), /not found/i)
  state.isGroup = true
  await assert.rejects(
    () => setConversationReadState(sessionId, conversationId, read),
    /not found/i,
  )
  state.isGroup = false
  hasMessages = false
  await assert.rejects(
    () => setConversationReadState(sessionId, conversationId, read),
    /not found/i,
  )
  hasMessages = true
}
failUpdate = true
await assert.rejects(
  () => setConversationReadState(sessionId, conversationId, false),
  /Database failed/,
)
assert.equal(events.length, 4)
