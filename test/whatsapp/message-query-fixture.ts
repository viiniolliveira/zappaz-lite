import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import type { Prisma } from '../../server/generated/prisma/index.js'

const id = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'
const date = new Date('2025-01-01T00:00:00Z')
const row = {
  id, sessionId: 'session-a', conversationId, messageId: 'WA123', clientRequestId: null,
  createdAt: date, updatedAt: date, revision: 1, fromMe: false, senderJid: null,
  senderName: null, type: 'text', text: 'hello', hasLink: false, status: null,
  sentAt: date, orderAt: date, editedAt: null, deletedAt: null, rawContent: {}, content: {}, media: null,
}
const queries: Prisma.WaMessageFindManyArgs[] = []
let found = true
const prisma = {
  globalWebhook: { findMany: async () => [] },
  waSession: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      ['session-a', 'session-b'].includes(where.id) ? { id: where.id, userId: 'owner' } : null,
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'USER', banned: false }),
  },
  waMessage: {
    findMany: async (query: Prisma.WaMessageFindManyArgs) => {
      queries.push(query)
      return [row, { ...row, id: '00000000-0000-4000-8000-000000000003' }]
    },
    findFirst: async (query: Prisma.WaMessageFindManyArgs) => {
      queries.push(query)
      return found ? row : null
    },
  },
}
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/db/prisma', () => ({ prisma }))
mock.module('@server/lib/auth.ts', () => ({ auth: { api: {
  getSession: async () => null,
  verifyApiKey: async ({ body }: { body: { key: string } }) => ({
    valid: body.key === 'scoped',
    key: { referenceId: 'owner', permissions: { sessions: ['session-a'] } },
  }),
} } }))

const { getMessages, getMessageById } = await import('../../server/src/modules/whatsapp-messages/query-service.ts')
const { GetMessageQuerySchema, GetMessagesQuerySchema } = await import('../../server/src/modules/whatsapp-messages/schema.ts')
assert.equal(GetMessagesQuerySchema.parse({}).limit, 50)
for (const invalid of [{ limit: 0 }, { limit: 101 }, { before: 'a', after: 'b' }, { phoneNumber: '+5511' }, { lid: '123' }, { jid: 'group@g.us' }, { conversationId: 'invalid' }]) {
  assert.equal(GetMessagesQuerySchema.safeParse(invalid).success, false)
}
assert.equal(GetMessageQuerySchema.safeParse({}).success, false)
for (const filter of [{ conversationId }, { phoneNumber: '5511999' }, { lid: '12345@lid' }, { jid: '5511999@s.whatsapp.net' }]) {
  assert.equal(GetMessageQuerySchema.safeParse(filter).success, true)
}

const first = await getMessages('session-a', { limit: 1 })
assert.equal(first.data[0]?.id, id)
assert.equal(first.data[0]?.messageId, 'WA123')
assert.equal(first.data[0]?.conversationId, conversationId)
assert.equal(first.page.hasMore, true)
assert.ok(first.page.nextCursor)
assert.deepEqual(queries.at(-1), {
  where: { sessionId: 'session-a', conversation: { sessionId: 'session-a', isGroup: false, AND: [] } },
  orderBy: [{ orderAt: 'desc' }, { id: 'desc' }], take: 2, include: { media: true },
})
await getMessages('session-a', { limit: 1, before: first.page.nextCursor })
assert.ok(queries.at(-1)?.where?.OR)
await getMessages('session-a', { limit: 1, after: first.boundaries.last! })
assert.deepEqual(queries.at(-1)?.orderBy, [{ orderAt: 'asc' }, { id: 'asc' }])
await assert.rejects(() => getMessages('session-b', { limit: 1, before: first.page.nextCursor! }), /Invalid pagination cursor/)
await assert.rejects(() => getMessages('session-a', { limit: 1, conversationId, before: first.page.nextCursor! }), /Invalid pagination cursor/)

for (const filters of [{ phoneNumber: '5511999' }, { lid: '12345@lid' }, { jid: '5511999@s.whatsapp.net' }]) {
  const page = await getMessages('session-a', { limit: 1, ...filters })
  await assert.rejects(() => getMessages('session-a', { limit: 1, before: page.page.nextCursor! }), /Invalid pagination cursor/)
}
const filters = { conversationId, phoneNumber: '5511999', lid: '12345@lid', jid: '5511999@s.whatsapp.net' }
const resolved = await getMessageById('session-a', 'WA123', filters)
assert.equal(resolved.id, id)
assert.equal(resolved.conversationId, conversationId)
const where = queries.at(-1)?.where
assert.equal(where?.sessionId, 'session-a')
assert.equal(where?.messageId, 'WA123')
assert.equal(where?.conversationId, conversationId)
assert.deepEqual(where?.conversation, {
  sessionId: 'session-a', isGroup: false, AND: [
    { OR: [{ jid: '5511999@s.whatsapp.net' }, { contact: { OR: [{ jid: '5511999@s.whatsapp.net' }, { phoneNumber: '5511999' }] } }] },
    { OR: [{ jid: '12345@lid' }, { contact: { OR: [{ jid: '12345@lid' }, { lid: '12345@lid' }] } }] },
    { OR: [{ jid: '5511999@s.whatsapp.net' }, { contact: { OR: [{ jid: '5511999@s.whatsapp.net' }, { phoneNumber: '5511999' }] } }] },
  ],
})
found = false
await assert.rejects(() => getMessageById('session-a', 'missing', { conversationId }), /Message not found/)

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/whatsapp-messages/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
const request = (path: string, key?: string) => app.request(`/api/v1/session/${path}`, {
  headers: key ? { 'x-api-key': key } : {},
})
const beforeDenied = queries.length
for (const path of ['session-a/messages', 'session-a/messages/WA123?lid=12345@lid']) {
  assert.equal((await request(path)).status, 401)
  assert.equal((await request(path, 'invalid')).status, 401)
  assert.equal((await request(path.replace('session-a', 'session-b'), 'scoped')).status, 401)
}
assert.equal(queries.length, beforeDenied)
assert.equal((await request('session-a/messages/WA123', 'scoped')).status, 400)
assert.equal((await request('session-a/messages?limit=101', 'scoped')).status, 400)
assert.equal((await request('session-a/messages/WA123?lid=12345@lid', 'scoped')).status, 404)
found = true
const response = await request('session-a/messages/WA123?lid=12345@lid', 'scoped')
assert.equal(response.status, 200)
assert.equal((await response.json()).data.id, id)
assert.equal((await request('session-a/messages?limit=1', 'scoped')).status, 200)
