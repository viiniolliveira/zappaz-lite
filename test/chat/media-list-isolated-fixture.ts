import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const sessionId = 'session-a'
const conversationId = '00000000-0000-4000-8000-000000000099'
const dates = [new Date('2025-01-01T00:00:00.000Z'), new Date('2025-01-02T00:00:00.000Z')]
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const rows = Array.from({ length: 53 }, (_, index) => {
  const id = uuid(53 - index)
  const messageId = uuid(index + 100)
  const date = index < 30 ? dates[0] : dates[1]
  assert.ok(date)
  const base = { sessionId, conversationId, createdAt: date, updatedAt: date, revision: 1 }
  const kind = [5, 25, 50].includes(index)
    ? 'audio'
    : [10, 31].includes(index)
      ? 'document'
      : [15, 45].includes(index)
        ? 'video'
        : 'image'
  const message = {
    ...base,
    id: messageId,
    messageId: `wa-${index}`,
    clientRequestId: null,
    fromMe: false,
    senderJid: null,
    senderName: null,
    type: kind,
    text: null,
    status: null,
    hasLink: false,
    sentAt: null,
    orderAt: date,
    editedAt: null,
    deletedAt: null,
    rawContent: {},
    content: {},
  }
  return {
    ...base,
    id,
    messageId,
    kind,
    mimeType: {
      audio: 'audio/ogg',
      document: 'application/pdf',
      video: 'video/mp4',
      image: 'image/jpeg',
    }[kind],
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
    message,
  }
})

type BaseWhere = {
  sessionId: string
  conversationId: string
  deletedAt: null
  conversation: { isGroup: false }
  media: { is: { kind: { in: string[] } | string | undefined } }
}
type CursorWhere = {
  OR: [{ orderAt: { lt?: Date; gt?: Date } }, { orderAt: Date; id: { lt?: string; gt?: string } }]
}
type CountArgs = { where: BaseWhere }
type FindArgs = {
  where: BaseWhere & Partial<CursorWhere>
  take: number
  include: unknown
  orderBy: unknown
}
type Operation = { kind: 'count'; args: CountArgs } | { kind: 'find'; args: FindArgs }
let transactions = 0
let conversationChecks = 0
let currentKind: 'gallery' | 'image' | 'video' | 'audio' | 'document' | undefined = 'gallery'
let boundary: (typeof rows)[number] | undefined
const foreign = [
  { ...rows[0], message: { ...rows[0].message, sessionId: 'session-b' } },
  { ...rows[1], message: { ...rows[1].message, conversationId: uuid(999) } },
  { ...rows[2], message: { ...rows[2].message, deletedAt: dates[0] } },
  {
    ...rows[3],
    id: uuid(990),
    messageId: uuid(991),
    kind: 'sticker',
    message: { ...rows[3].message, id: uuid(991) },
  },
]
const allRows = [...rows, ...foreign]
mock.module('@db/prisma', () => ({
  prisma: {
    waMessage: {
      count: (args: CountArgs): Operation => ({ kind: 'count', args }),
      findMany: (args: FindArgs): Operation => ({ kind: 'find', args }),
    },
    $transaction: async (operations: Operation[]) => {
      transactions++
      assert.equal(operations.length, 2)
      const [count, find] = operations
      if (count?.kind !== 'count' || find?.kind !== 'find')
        throw new Error('Unexpected transaction operations')
      const gallery = currentKind === 'gallery'
      const expectedWhere = {
        sessionId,
        conversationId,
        deletedAt: null,
        conversation: { isGroup: false },
        media: {
          is: { kind: gallery ? { in: ['image', 'video', 'audio', 'document'] } : currentKind },
        },
      }
      assert.deepEqual(count.args, { where: expectedWhere })
      const { OR, ...baseWhere } = find.args.where
      assert.deepEqual(baseWhere, expectedWhere)
      assert.equal(find.args.take, 25)
      assert.deepEqual(find.args.include, { media: true })
      assert.deepEqual(find.args.orderBy, [
        { orderAt: gallery ? 'desc' : 'asc' },
        { id: gallery ? 'desc' : 'asc' },
      ])
      if (!boundary) assert.equal(OR, undefined)
      else {
        const op = gallery ? 'lt' : 'gt'
        assert.deepEqual(OR, [
          { orderAt: { [op]: boundary.message.orderAt } },
          { orderAt: boundary.message.orderAt, id: { [op]: boundary.message.id } },
        ])
      }
      const filtered = allRows.filter(
        (row) =>
          row.message.sessionId === count.args.where.sessionId &&
          row.message.conversationId === count.args.where.conversationId &&
          row.message.deletedAt === null &&
          (gallery
            ? ['image', 'video', 'audio', 'document'].includes(row.kind)
            : !currentKind || row.kind === currentKind),
      )
      const sorted = filtered.toSorted(
        (a, b) =>
          (a.message.orderAt.getTime() - b.message.orderAt.getTime() ||
            a.message.id.localeCompare(b.message.id)) * (gallery ? -1 : 1),
      )
      const selected = OR
        ? sorted.filter((row) => {
            const time = OR[0].orderAt.lt ?? OR[0].orderAt.gt
            const id = OR[1].id.lt ?? OR[1].id.gt
            assert.ok(time && id)
            const comparison =
              row.message.orderAt.getTime() - time.getTime() || row.message.id.localeCompare(id)
            return gallery ? comparison < 0 : comparison > 0
          })
        : sorted
      return [
        filtered.length,
        selected.slice(0, find.args.take).map(({ message, ...media }) => ({ ...message, media })),
      ]
    },
  },
}))
mock.module('../../server/src/modules/conversations/service.ts', () => ({
  getConversation: async (session: string, conversation: string) => {
    assert.equal(session, sessionId)
    assert.equal(conversation, conversationId)
    conversationChecks++
  },
}))

const { encodeChatCursor } = await import('../../server/src/lib/chat-cursor.ts')
const { listMedia } = await import('../../server/src/modules/conversation-messages/service.ts')
const orderedGallery = rows.toSorted(
  (a, b) =>
    b.message.orderAt.getTime() - a.message.orderAt.getTime() ||
    b.message.id.localeCompare(a.message.id),
)
const seen: string[] = []
let cursor: string | undefined
for (const [index, size] of [24, 24, 5].entries()) {
  const result = await listMedia(sessionId, conversationId, { kind: 'gallery', limit: 24, cursor })
  assert.equal(result.status, 'success')
  assert.equal(result.count, 53)
  assert.equal(result.data.length, size)
  assert.equal(result.page.hasMore, index < 2)
  assert.equal(result.page.nextCursor === null, index === 2)
  for (const item of result.data) {
    const row = rows.find((candidate) => candidate.id === item.id)
    assert.ok(row)
    assert.equal(item.messageRecordId, row.message.id)
    assert.equal(item.message.id, row.message.id)
    assert.equal(item.message.messageId, row.message.messageId)
    assert.equal(item.message.media?.id, item.id)
    assert.equal(item.message.sessionId, sessionId)
    assert.equal(item.message.conversationId, conversationId)
    seen.push(item.id)
  }
  assert.deepEqual(
    result.data.map((item) => item.id),
    orderedGallery.slice(index * 24, index * 24 + size).map((row) => row.id),
  )
  const last = result.data.at(-1)
  boundary = rows.find((row) => row.id === last?.id)
  cursor = result.page.nextCursor ?? undefined
}
assert.equal(new Set(seen).size, 53)
assert.deepEqual(
  seen,
  orderedGallery.map((row) => row.id),
)
assert.ok(
  rows
    .filter((row) => row.kind === 'audio' || row.kind === 'document')
    .every((row) => seen.includes(row.id)),
)
assert.equal(transactions, 3)
assert.equal(conversationChecks, 3)

for (const kind of ['image', 'video', 'audio', 'document', undefined] as const) {
  currentKind = kind
  boundary = undefined
  cursor = undefined
  const expected = allRows
    .filter(
      (row) =>
        row.message.sessionId === sessionId &&
        row.message.conversationId === conversationId &&
        row.message.deletedAt === null &&
        (!kind || row.kind === kind),
    )
    .toSorted(
      (a, b) =>
        a.message.orderAt.getTime() - b.message.orderAt.getTime() ||
        a.message.id.localeCompare(b.message.id),
    )
  const actual: string[] = []
  do {
    const result = await listMedia(sessionId, conversationId, { kind, limit: 24, cursor })
    assert.equal(result.count, expected.length)
    actual.push(...result.data.map((item) => item.id))
    const last = result.data.at(-1)
    boundary = allRows.find((row) => row.id === last?.id)
    cursor = result.page.nextCursor ?? undefined
    assert.equal(result.page.hasMore, !!cursor)
  } while (cursor)
  assert.deepEqual(
    actual,
    expected.map((row) => row.id),
  )
  assert.equal(new Set(actual).size, actual.length)
}
currentKind = 'gallery'
boundary = undefined

for (const scope of [
  ['media', sessionId, conversationId, 'gallery'],
  ['message-media', 'session-b', conversationId, 'gallery'],
  ['message-media', sessionId, uuid(999), 'gallery'],
  ['message-media', sessionId, conversationId, 'image'],
]) {
  const invalid = encodeChatCursor(
    JSON.stringify(scope),
    rows[0].message.id,
    dates[0].toISOString(),
  )
  await assert.rejects(
    listMedia(sessionId, conversationId, { kind: 'gallery', limit: 24, cursor: invalid }),
    /Invalid pagination cursor/,
  )
}
await assert.rejects(
  listMedia(sessionId, conversationId, { kind: 'gallery', limit: 24, cursor: 'tampered' }),
  /Invalid pagination cursor/,
)
