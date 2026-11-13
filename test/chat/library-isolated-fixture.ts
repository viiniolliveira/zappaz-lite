import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const sessionId = 'session-a'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const conversationId = uuid(1)
const otherConversation = uuid(2)
const date = new Date('2025-01-01T00:00:00.000Z')
const contact = {
  id: uuid(80),
  sessionId,
  jid: '123@s.whatsapp.net',
  name: 'WhatsApp',
  pushName: 'Push',
  localName: 'Local',
  phoneNumber: '123',
  avatarUrl: 'https://example.com/avatar',
  avatarCheckedAt: null,
  isSaved: true,
  createdAt: date,
  updatedAt: date,
  revision: 1,
}
const conversation = { id: conversationId, sessionId, jid: contact.jid, isGroup: false, contact }
function row(n: number, type: string, hasLink: boolean, overrides: Record<string, unknown> = {}) {
  const id = uuid(100 + n)
  const media =
    type === 'text'
      ? null
      : {
          id: uuid(200 + n),
          sessionId,
          conversationId,
          messageId: id,
          kind: type,
          mimeType: 'application/octet-stream',
          fileName: null,
          size: null,
          duration: null,
          width: null,
          height: null,
          voice: false,
          thumbnailBase64: null,
          thumbnailMimeType: null,
          thumbnailWidth: null,
          thumbnailHeight: null,
          storage: null,
          key: null,
          persistedAt: null,
          storageStatus: 'not_saved',
          createdAt: date,
          updatedAt: date,
          revision: 1,
        }
  return {
    id,
    sessionId,
    conversationId,
    messageId: `wa-${n}`,
    clientRequestId: null,
    fromMe: false,
    senderJid: null,
    senderName: null,
    type,
    text: hasLink ? 'https://example.com' : null,
    hasLink,
    status: null,
    sentAt: null,
    orderAt: date,
    createdAt: date,
    updatedAt: date,
    editedAt: null,
    deletedAt: null,
    rawContent: {},
    content: {},
    revision: 1,
    media,
    conversation,
    ...overrides,
  }
}
const rows = [
  row(1, 'image', true),
  row(2, 'video', false),
  row(3, 'audio', false),
  row(4, 'document', false),
  row(5, 'text', true),
  row(6, 'image', false, { media: null }),
  row(7, 'image', false, { deletedAt: date }),
  row(8, 'image', false, { sessionId: 'session-b' }),
  row(9, 'image', false, { conversation: { ...conversation, isGroup: true } }),
  row(10, 'image', false, {
    conversationId: otherConversation,
    conversation: { ...conversation, id: otherConversation },
  }),
  row(11, 'text', false),
  row(12, 'sticker', false),
]

type Where = Record<string, unknown>
function matches(value: unknown, condition: unknown): boolean {
  if (condition === undefined) return true
  if (condition === null || typeof condition !== 'object' || condition instanceof Date)
    return value instanceof Date && condition instanceof Date
      ? value.getTime() === condition.getTime()
      : value === condition
  const c = condition as Where
  if ('in' in c) return (c.in as unknown[]).includes(value)
  if ('not' in c) return !matches(value, c.not)
  if ('lt' in c) return (value as string | Date) < (c.lt as string | Date)
  if ('isNot' in c) return !matches(value, c.isNot)
  if ('is' in c) return matches(value, c.is)
  if (!value || typeof value !== 'object') return false
  return Object.entries(c).every(([key, expected]) =>
    key === 'OR'
      ? (expected as Where[]).some((item) => matches(value, item))
      : key === 'AND'
        ? (expected as Where[]).every((item) => matches(value, item))
        : matches((value as Where)[key], expected),
  )
}
type Args = { where: Where; take: number; orderBy: unknown }
type Operation = { kind: 'count' | 'find'; args: Args }
let transactions = 0
mock.module('@db/prisma', () => ({
  prisma: {
    waSession: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        ['session-a', 'session-b'].includes(where.id)
          ? { id: where.id, userId: where.id === 'session-a' ? 'owner' : 'other' }
          : null,
    },
    user: { findUnique: async () => ({ id: 'owner', role: 'USER', banned: false }) },
    waMessage: {
      count: (args: Args): Operation => ({ kind: 'count', args }),
      findMany: (args: Args): Operation => ({ kind: 'find', args }),
    },
    $transaction: async (operations: Operation[]) => {
      transactions++
      assert.equal(operations.length, 2)
      const count = operations.find((item) => item.kind === 'count')
      assert.ok(count)
      const find = operations.find((item) => item.kind === 'find')
      assert.ok(find)
      assert.deepEqual(find.args.orderBy, [{ orderAt: 'desc' }, { id: 'desc' }])
      const selected = rows
        .filter((row) => matches(row, find.args.where))
        .sort((a, b) => b.orderAt.getTime() - a.orderAt.getTime() || b.id.localeCompare(a.id))
      return [
        rows.filter((row) => matches(row, count.args.where)).length,
        selected.slice(0, find.args.take),
      ]
    },
  },
}))
mock.module('../../server/src/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get('cookie') ? { user: { id: 'owner' } } : null,
    },
  },
}))
mock.module('../../server/src/modules/conversations/service.ts', () => ({
  getConversation: async (session: string, id: string) => {
    if (session !== sessionId || ![conversationId, otherConversation].includes(id))
      throw new Error('Conversation not found')
  },
}))

const { listLibrary } = await import('../../server/src/modules/chat-library/service.ts')
const { LibraryQuerySchema } = await import('../../server/src/modules/chat-library/schema.ts')
assert.deepEqual(LibraryQuerySchema.parse({}), { kind: 'media', limit: 50 })
for (const invalid of [
  { kind: 'bad' },
  { conversationId: 'bad' },
  { limit: '0' },
  { limit: '101' },
  { limit: '1.5' },
  { cursor: 'x'.repeat(4097) },
])
  assert.equal(LibraryQuerySchema.safeParse(invalid).success, false)
const media = await listLibrary(sessionId, { kind: 'media', limit: 2 })
assert.equal(media.count, 3)
assert.equal(media.page.hasMore, true)
assert.ok(media.page.nextCursor)
const firstCursor = media.page.nextCursor
assert.deepEqual(
  media.data.map((item) => item.message.id),
  [uuid(110), uuid(102)],
)
assert.equal(media.data[0]?.conversation.displayName, 'Local')
assert.equal(media.data[0]?.conversation.avatarUrl, contact.avatarUrl)
assert.equal(media.data[0]?.conversation.sessionId, sessionId)
const second = await listLibrary(sessionId, {
  kind: 'media',
  limit: 2,
  cursor: firstCursor,
})
assert.equal(second.count, 3)
assert.deepEqual(
  second.data.map((item) => item.message.id),
  [uuid(101)],
)
assert.equal(second.page.hasMore, false)
assert.equal(second.page.nextCursor, null)
assert.equal(second.data[0]?.message.hasLink, true)
const document = await listLibrary(sessionId, { kind: 'document', limit: 50 })
assert.deepEqual(
  document.data.map((item) => item.message.id),
  [uuid(104)],
)
const links = await listLibrary(sessionId, { kind: 'link', limit: 50 })
assert.deepEqual(
  links.data.map((item) => item.message.id),
  [uuid(105), uuid(101)],
)
assert.equal(links.data[0]?.message.media, null)
assert.deepEqual(LibraryQuerySchema.parse({ kind: 'all', limit: '1' }), {
  kind: 'all',
  limit: 1,
})
const allFirst = await listLibrary(sessionId, { kind: 'all', limit: 2, conversationId })
assert.equal(allFirst.count, 5, 'an image containing a link is counted only once')
assert.deepEqual(
  allFirst.data.map((item) => item.message.id),
  [uuid(105), uuid(104)],
)
assert.ok(allFirst.page.nextCursor)
const allSecond = await listLibrary(sessionId, {
  kind: 'all',
  limit: 2,
  conversationId,
  cursor: allFirst.page.nextCursor,
})
assert.equal(allSecond.count, 5, 'the count is independent of the cursor')
assert.deepEqual(
  allSecond.data.map((item) => item.message.id),
  [uuid(103), uuid(102)],
)
assert.ok(allSecond.page.nextCursor)
const allThird = await listLibrary(sessionId, {
  kind: 'all',
  limit: 2,
  conversationId,
  cursor: allSecond.page.nextCursor,
})
assert.equal(allThird.count, 5)
assert.deepEqual(
  allThird.data.map((item) => item.message.id),
  [uuid(101)],
)
assert.deepEqual(allThird.page, { hasMore: false, nextCursor: null })
await assert.rejects(
  listLibrary(sessionId, {
    kind: 'link',
    limit: 2,
    conversationId,
    cursor: allFirst.page.nextCursor,
  }),
  /Invalid pagination cursor/,
)
const allSessions = await listLibrary(sessionId, { kind: 'all', limit: 50 })
assert.equal(allSessions.count, 6)
assert.deepEqual(
  allSessions.data.map((item) => item.message.id),
  [uuid(110), uuid(105), uuid(104), uuid(103), uuid(102), uuid(101)],
)
const scopedIds: string[] = []
let scopedCursor: string | undefined
do {
  const scoped = await listLibrary(sessionId, {
    kind: 'media',
    limit: 1,
    conversationId,
    cursor: scopedCursor,
  })
  assert.equal(scoped.count, 3)
  assert.ok(scoped.data.every((item) => item.conversation.id === conversationId))
  scopedIds.push(...scoped.data.map((item) => item.message.id))
  scopedCursor = scoped.page.nextCursor ?? undefined
  assert.equal(scoped.page.hasMore, !!scopedCursor)
} while (scopedCursor)
assert.deepEqual(scopedIds, [uuid(103), uuid(102), uuid(101)])
assert.equal(new Set(scopedIds).size, 3)
assert.ok(![...media.data, ...second.data].some((item) => item.message.type === 'audio'))
await assert.rejects(
  listLibrary(sessionId, { kind: 'media', limit: 50, conversationId: uuid(999) }),
  /Conversation not found/,
)
for (const args of [
  { session: 'session-b', kind: 'media' as const },
  { session: sessionId, kind: 'link' as const },
])
  await assert.rejects(
    listLibrary(args.session, { kind: args.kind, limit: 2, cursor: firstCursor }),
    /Invalid pagination cursor/,
  )
await assert.rejects(
  listLibrary(sessionId, {
    kind: 'media',
    limit: 2,
    conversationId,
    cursor: firstCursor,
  }),
  /Invalid pagination cursor/,
)
await assert.rejects(
  listLibrary(sessionId, { kind: 'media', limit: 2, cursor: `${media.page.nextCursor}.extra` }),
  /Invalid pagination cursor/,
)
assert.equal(transactions, 11)

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/chat-library/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
assert.equal((await app.request('/api/v1/session/session-a/library')).status, 401)
assert.equal(
  (await app.request('/api/v1/session/session-b/library', { headers: { cookie: 'session=owner' } }))
    .status,
  401,
)
assert.equal(
  (await app.request('/api/v1/session/session-a/library', { headers: { cookie: 'session=owner' } }))
    .status,
  200,
)
const allResponse = await app.request(
  `/api/v1/session/session-a/library?kind=all&conversationId=${conversationId}&limit=1`,
  {
    headers: { cookie: 'session=owner' },
  },
)
assert.equal(allResponse.status, 200)
const allBody = (await allResponse.json()) as {
  count: number
  data: { message: { id: string } }[]
  page: { hasMore: boolean }
}
assert.equal(allBody.count, 5)
assert.deepEqual(
  allBody.data.map((item) => item.message.id),
  [uuid(105)],
)
assert.equal(allBody.page.hasMore, true)

for (const query of ['kind=invalid', 'conversationId=bad', 'limit=0', 'limit=101', 'cursor=bad']) {
  const response = await app.request(`/api/v1/session/session-a/library?${query}`, {
    headers: { cookie: 'session=owner' },
  })
  assert.equal(response.status, 400)
}
