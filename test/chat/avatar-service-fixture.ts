import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const sessionId = 'session-a'
const contactId = '00000000-0000-4000-8000-000000000001'
const date = new Date('2025-01-01T00:00:00.000Z')
const record = {
  id: contactId,
  sessionId,
  jid: '222@lid',
  lid: '222@lid',
  phoneNumber: '111' as string | null,
  name: null,
  pushName: null,
  localName: null,
  email: null,
  annotations: null,
  isSaved: false,
  avatarUrl: 'https://example.test/old' as string | null,
  avatarCheckedAt: null as Date | null,
  revision: 1,
  createdAt: date,
  updatedAt: date,
}
let eligible = true
let enabled = true
let connected = true
let transaction = false
let conversationRevision = 1
let lookupResult: string | null = 'https://example.test/new'
let failure: Error | null = null
let deferred: Promise<string | null> | null = null
const lookups: Array<[string, string]> = []
const events: unknown[] = []
const findFirst = async ({
  where,
}: {
  where: { id: string; sessionId: string; conversations: unknown }
}) => {
  assert.deepEqual(where.conversations, { some: { isGroup: false, messages: { some: {} } } })
  return eligible && where.id === record.id && where.sessionId === record.sessionId
    ? { ...record }
    : null
}
const tx = {
  waContact: {
    findFirst,
    update: async ({
      where,
      data,
    }: {
      where: { sessionId: string; id: string }
      data: { avatarUrl: string | null; avatarCheckedAt: Date; revision: { increment: number } }
    }) => {
      assert.deepEqual(where, { sessionId, id: contactId })
      assert.equal(transaction, true)
      record.avatarUrl = data.avatarUrl
      record.avatarCheckedAt = data.avatarCheckedAt
      record.revision += data.revision.increment
      return { ...record }
    },
  },
  waConversation: {
    updateMany: async ({
      where,
      data,
    }: {
      where: unknown
      data: { revision: { increment: number } }
    }) => {
      assert.deepEqual(where, { sessionId, contactId })
      conversationRevision += data.revision.increment
    },
  },
}
const prisma = {
  waContact: { findFirst },
  waConversation: { findMany: async () => [{ id: 'conversation' }] },
}
mock.module('@db/prisma', () => ({ prisma }))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  chatTransaction: async (_session: string, fn: (value: typeof tx) => Promise<unknown>) => {
    transaction = true
    try {
      return await fn(tx)
    } finally {
      transaction = false
    }
  },
}))
mock.module('../../server/src/lib/chat-events.ts', () => ({
  publishChatChange: (event: unknown) => {
    assert.equal(transaction, false)
    events.push(event)
  },
}))
mock.module('../../server/src/services/whatsapp.ts', () => ({
  whatsappService: {
    isSessionEnabled: () => enabled,
    isSessionConnected: () => connected,
    getContactProfilePictureUrl: async (session: string, jid: string) => {
      lookups.push([session, jid])
      if (failure) throw failure
      return deferred ?? lookupResult
    },
  },
}))
const { refreshContactAvatar } = await import('../../server/src/modules/contacts/service.ts')
const refresh = () => refreshContactAvatar(sessionId, contactId)

// Cached photos, including a known absent photo, never contact WhatsApp.
for (const url of ['https://example.test/old', null]) {
  record.avatarUrl = url
  record.avatarCheckedAt = new Date()
  const cached = await refresh()
  assert.equal(cached.avatarUrl, url)
  assert.equal(cached.avatarCheckedAt, record.avatarCheckedAt.toISOString())
}
assert.equal(lookups.length, 0)
assert.equal(events.length, 0)

// Missing check date and stale timestamp both fetch; phone JID takes precedence.
record.avatarCheckedAt = null
const before = Date.now()
let result = await refresh()
assert.deepEqual(lookups.at(-1), [sessionId, '111@s.whatsapp.net'])
assert.equal(result.avatarUrl, lookupResult)
assert.ok(Date.parse(result.avatarCheckedAt ?? '') >= before)
assert.equal(record.revision, 2)
assert.equal(conversationRevision, 2)
assert.deepEqual(events, [
  { sessionId, contactId },
  { sessionId, conversationId: 'conversation' },
])
await refresh()
assert.equal(lookups.length, 1)

// A successful check still increments revisions and publishes when URL is unchanged.
record.avatarCheckedAt = new Date(Date.now() - 3_600_001)
result = await refresh()
assert.equal(result.avatarUrl, lookupResult)
assert.equal(record.revision, 3)
assert.equal(conversationRevision, 3)
assert.equal(events.length, 4)

// Official client translates 404 into null; cache and publish the absence.
record.avatarCheckedAt = null
lookupResult = null
result = await refresh()
assert.equal(result.avatarUrl, null)
assert.ok(result.avatarCheckedAt)
const count = lookups.length
await refresh()
assert.equal(lookups.length, count)

// Missing phone uses the stored JID.
record.phoneNumber = null
record.avatarCheckedAt = null
await refresh()
assert.deepEqual(lookups.at(-1), [sessionId, '222@lid'])

// Failure leaves the previous URL, timestamp, revisions and notifications intact.
record.avatarUrl = 'https://example.test/old'
record.avatarCheckedAt = new Date(0)
const snapshot = { ...record }
const eventCount = events.length
failure = new Error('unavailable')
await assert.rejects(
  refresh(),
  (error: unknown) =>
    typeof error === 'object' && error !== null && 'status' in error && error.status === 503,
)
assert.deepEqual(record, snapshot)
assert.equal(events.length, eventCount)
failure = null

// Contact IDs are scoped to session and require a private conversation with messages.
await assert.rejects(refreshContactAvatar('session-b', contactId))
eligible = false
await assert.rejects(refresh())
eligible = true
enabled = false
await assert.rejects(refresh())
enabled = true
connected = false
await assert.rejects(refresh())
connected = true

// Concurrent callers share a single request and a subsequent call uses the cache.
let resolve!: (url: string | null) => void
deferred = new Promise((done) => {
  resolve = done
})
const beforeConcurrency = lookups.length
const first = refresh()
const second = refresh()
await Promise.resolve()
resolve('https://example.test/shared')
const [one, two] = await Promise.all([first, second])
assert.deepEqual(one, two)
assert.equal(lookups.length, beforeConcurrency + 1)
deferred = null
await refresh()
assert.equal(lookups.length, beforeConcurrency + 1)
