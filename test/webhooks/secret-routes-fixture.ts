import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

type WebhookRecord = {
  id: string
  waSessionId: string
  url: string
  enabled: boolean
  events: Record<string, boolean>
  headers: Record<string, string>
}

const session = { id: 'session-1', userId: 'user-1', enabled: true }
const records = new Map<string, WebhookRecord>()
let reloads = 0
mock.module('@lib/logger', () => ({ logger: { warn() {}, error() {} } }))
mock.module('@services/whatsapp', () => ({
  default: {},
  whatsappService: {
    loadWebhooks: async () => {
      reloads++
    },
  },
}))
mock.module('@server/lib/auth.ts', () => ({
  auth: { api: { getSession: async () => ({ user: { id: 'user-1' } }) } },
}))
const prisma = {
  user: { findUnique: async () => ({ id: 'user-1', role: 'USER' }) },
  waSession: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      where.id === session.id ? session : null,
    findUniqueOrThrow: async () => session,
  },
  webhook: {
    count: async () => records.size,
    findMany: async ({ where }: { where: { waSessionId: string } }) =>
      [...records.values()].filter((record) => record.waSessionId === where.waSessionId),
    findUnique: async ({ where }: { where: { id: string; waSessionId: string } }) => {
      const record = records.get(where.id)
      return record?.waSessionId === where.waSessionId ? record : null
    },
    create: async ({ data }: { data: Omit<WebhookRecord, 'id'> }) => {
      const record = { ...data, id: `webhook-${records.size + 1}` }
      records.set(record.id, record)
      return record
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<WebhookRecord> }) => {
      const previous = records.get(where.id)
      assert.ok(previous)
      const record = { ...previous, ...data }
      records.set(record.id, record)
      return record
    },
  },
  $executeRaw: async () => 0,
  $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => fn(prisma),
}
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/db/prisma', () => ({ prisma }))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/webhooks/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
const base = '/api/v1/session/session-1/webhook'
const headers = {
  cookie: 'session=user',
  origin: 'http://localhost:5173',
  'content-type': 'application/json',
}
const secretHeader = 'X-Zappaz-Webhook-Secret'

async function request(method: string, path: string, body?: object) {
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function assertPublic(record: Record<string, unknown>, secret: string | null) {
  assert.equal(record.secret, secret)
  assert.equal(
    Object.keys(record.headers as object).some(
      (key) => key.toLowerCase() === secretHeader.toLowerCase(),
    ),
    false,
  )
}

const firstSecret = 'initial-secret-value'
const rotatedSecret = 'rotated-secret-value'
const created = await request('POST', base, {
  url: 'https://example.com/hook',
  events: {},
  secret: firstSecret,
  headers: { 'X-First': 'one' },
})
assert.equal(created.status, 201)
const createdData = (await created.json()).data
assertPublic(createdData, firstSecret)
assert.deepEqual(createdData.headers, { 'X-First': 'one' })
assert.equal(records.get(createdData.id)?.headers[secretHeader], firstSecret)

const noSecret = await request('POST', base, { url: 'https://example.com/no-secret', events: {} })
assert.equal(noSecret.status, 201)
assertPublic((await noSecret.json()).data, null)

const list = await request('GET', base)
assert.equal(list.status, 200)
const listBody = await list.json()
assert.equal(listBody.total, 2)
assert.equal(listBody.data.length, 2)
assertPublic(listBody.data[0], firstSecret)
assertPublic(listBody.data[1], null)

const get = await request('GET', `${base}/${createdData.id}`)
assert.equal(get.status, 200)
assertPublic((await get.json()).data, firstSecret)

const changedHeaders = await request('PUT', `${base}/${createdData.id}`, {
  headers: { 'X-Second': 'two' },
})
assert.equal(changedHeaders.status, 200)
const changedData = (await changedHeaders.json()).data
assertPublic(changedData, firstSecret)
assert.deepEqual(changedData.headers, { 'X-Second': 'two' })
assert.equal(records.get(createdData.id)?.headers[secretHeader], firstSecret)

const rotated = await request('PUT', `${base}/${createdData.id}`, { secret: rotatedSecret })
assert.equal(rotated.status, 200)
const rotatedData = (await rotated.json()).data
assertPublic(rotatedData, rotatedSecret)
assert.deepEqual(rotatedData.headers, { 'X-Second': 'two' })
assert.equal(records.get(createdData.id)?.headers[secretHeader], rotatedSecret)

const removed = await request('PUT', `${base}/${createdData.id}`, { secret: null })
assert.equal(removed.status, 200)
const removedData = (await removed.json()).data
assertPublic(removedData, null)
assert.deepEqual(removedData.headers, { 'X-Second': 'two' })
assert.equal(Object.hasOwn(records.get(createdData.id)?.headers ?? {}, secretHeader), false)
const afterRemoval = await request('GET', `${base}/${createdData.id}`)
assert.equal(afterRemoval.status, 200)
assertPublic((await afterRemoval.json()).data, null)
assert.equal(reloads, 5)
