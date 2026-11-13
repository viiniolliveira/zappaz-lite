import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

const cutoff = new Date('2025-01-02T00:00:00Z')
const order = new Date('2025-01-03T00:00:00Z')
const old = new Date('2025-01-01T00:00:00Z')
const recent = new Date('2025-01-04T00:00:00Z')
const messages = [
  { id: 'b', sessionId: 's1', conversationId: 'c1', createdAt: old, orderAt: order, fromMe: false, live: true },
  { id: 'a', sessionId: 's1', conversationId: 'c1', createdAt: recent, orderAt: order, fromMe: false, live: true },
  { id: 'c', sessionId: 's1', conversationId: 'c1', createdAt: recent, orderAt: order, fromMe: false, live: true },
  { id: 'd', sessionId: 's1', conversationId: 'c1', createdAt: recent, orderAt: order, fromMe: true, live: true },
  { id: 'e', sessionId: 's2', conversationId: 'c2', createdAt: old, orderAt: old, fromMe: false, live: true },
]
const conversations = [
  { id: 'c1', lastReadOrderAt: order, lastReadMessageId: 'b', lastMessageId: 'b' as string | null, lastActivityAt: order as Date | null, unreadCount: 5, revision: 0 },
  { id: 'c2', lastReadOrderAt: null as Date | null, lastReadMessageId: null as string | null, lastMessageId: 'e' as string | null, lastActivityAt: old as Date | null, unreadCount: 1, revision: 0 },
]
const events: unknown[] = []
const waMessage = {
  async findMany({ where, distinct }: { where: { sessionId?: string; createdAt: { lte: Date } }; distinct: string[] }) {
    const rows = messages.filter(m => (!where.sessionId || m.sessionId === where.sessionId) && m.createdAt <= where.createdAt.lte)
    return [...new Set(rows.map(m => distinct[0] === 'sessionId' ? m.sessionId : m.conversationId))].map(value => ({ [distinct[0]]: value }))
  },
  async deleteMany({ where }: { where: { sessionId: string; createdAt: { lte: Date } } }) {
    let count = 0
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sessionId === where.sessionId && messages[i].createdAt <= where.createdAt.lte) { messages.splice(i, 1); count++ }
    return { count }
  },
  async findFirst({ where }: { where: { sessionId: string; conversationId: string } }) {
    return messages.filter(m => m.sessionId === where.sessionId && m.conversationId === where.conversationId).sort((a, b) => b.orderAt.getTime() - a.orderAt.getTime() || b.id.localeCompare(a.id))[0] ?? null
  },
  async count({ where }: { where: { sessionId: string; conversationId: string; fromMe: boolean; content: { equals: boolean }; OR?: Array<{ orderAt: Date | { gt: Date }; id?: { gt: string } }> } }) {
    return messages.filter(m => m.sessionId === where.sessionId && m.conversationId === where.conversationId && m.fromMe === where.fromMe && m.live === where.content.equals && (!where.OR || where.OR.some(clause => clause.orderAt instanceof Date ? m.orderAt.getTime() === clause.orderAt.getTime() && m.id > (clause.id?.gt ?? '') : m.orderAt > clause.orderAt.gt))).length
  },
}
const tx = { waMessage, waConversation: {
  async findUniqueOrThrow({ where }: { where: { id: string } }) { const c = conversations.find(c => c.id === where.id); if (!c) throw Error('missing'); return c },
  async update({ where, data }: { where: { id: string }; data: { lastMessageId: string | null; lastActivityAt: Date | null; unreadCount: number; revision: { increment: number } } }) {
    const c = conversations.find(c => c.id === where.id)!; Object.assign(c, { ...data, revision: c.revision + data.revision.increment })
  },
} }
mock.module('@db/prisma', () => ({ prisma: { waMessage } }))
mock.module('../../server/src/lib/chat-store.ts', () => ({ chatTransaction: async (_sessionId: string, callback: (tx: unknown) => unknown) => callback(tx) }))
mock.module('../../server/src/lib/chat-events.ts', () => ({ publishChatChange: (event: unknown) => events.push(event) }))
const { pruneChatMessages } = await import('../../server/src/lib/chat-retention.ts')
assert.deepEqual(await pruneChatMessages(cutoff, 's1'), { count: 1 })
assert.deepEqual(conversations[0], { id: 'c1', lastReadOrderAt: order, lastReadMessageId: 'b', lastMessageId: 'd', lastActivityAt: order, unreadCount: 1, revision: 1 })
assert.equal(conversations[1].lastMessageId, 'e')
assert.deepEqual(events, [{ sessionId: 's1', conversationId: 'c1', messagesPruned: true }])
assert.deepEqual(await pruneChatMessages(cutoff), { count: 1 })
assert.equal(conversations[1].lastMessageId, null)
assert.equal(conversations[1].lastActivityAt, null)
assert.equal(conversations[1].unreadCount, 0)
assert.deepEqual(await pruneChatMessages(cutoff), { count: 0 })
assert.equal(events.length, 2)
assert.deepEqual(events[1], { sessionId: 's2', conversationId: 'c2', messagesPruned: true })
