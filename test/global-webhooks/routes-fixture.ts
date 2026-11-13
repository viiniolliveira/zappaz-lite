import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import type {
  CreateGlobalWebhookInput,
  GlobalWebhookEntity,
  UpdateGlobalWebhookInput,
} from '../../server/src/modules/global-webhooks/types.ts'

const users: Record<string, { id: string; role: string }> = {
  user: { id: 'user', role: 'USER' },
  admin: { id: 'admin', role: 'ADMIN' },
}
const records = new Map<string, GlobalWebhookEntity>()
let reloads = 0
mock.module('@lib/logger', () => ({ logger: { warn() {}, error() {} } }))
mock.module('@services/whatsapp', () => ({
  whatsappService: {
    loadGlobalWebhooks: async () => {
      reloads++
    },
  },
}))
const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users[where.id] ?? null,
    },
    globalWebhook: {
      findMany: async () => [...records.values()],
      findUnique: async ({ where }: { where: { id: string } }) =>
        records.get(where.id) ?? null,
      count: async (args?: { where: { id: string } }) =>
        args ? (records.has(args.where.id) ? 1 : 0) : records.size,
      create: async ({ data }: { data: CreateGlobalWebhookInput }) => {
        assert.deepEqual(Object.keys(data).sort(), [
          'enabled',
          'events',
          'headers',
          'url',
        ])
        const record: GlobalWebhookEntity = {
          ...data,
          id: 'webhook-1',
          createdAt: new Date('2026-10-30T23:20:00.000Z'),
        }
        records.set(record.id, record)
        return record
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: UpdateGlobalWebhookInput }) => {
        assert.ok(!('displayName' in data))
        const previous = records.get(where.id)
        assert.ok(previous)
        const record: GlobalWebhookEntity = { ...previous, ...data }
        records.set(record.id, record)
        return record
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const record = records.get(where.id)
        records.delete(where.id)
        return record
      },
    },
    $executeRaw: async () => 0,
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>): Promise<T> => fn(prisma),
}
mock.module('@db/prisma', () => ({ prisma }))

mock.module('@server/lib/auth.ts', () => ({ auth: { api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get('cookie')?.replace('session=', '')
  return id && users[id] ? { user: { id } } : null
} }, handler: () => new Response(null, { status: 404 }) } }))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import(
  '../../server/src/common/http/error-handler.ts'
)
const { notFoundHandler } = await import(
  '../../server/src/common/http/not-found-handler.ts'
)
const { default: globalWebhooksRouter } = await import(
  '../../server/src/modules/global-webhooks/route.ts'
)
const app = createApp()
app.onError(errorHandler)
app.notFound(notFoundHandler)
app.route('/admin', globalWebhooksRouter)

const adminHeaders = {
  cookie: 'session=admin',
  origin: 'http://localhost:5173',
  'content-type': 'application/json',
}
const paths = [
  { method: 'GET', path: '/admin/webhook' },
  { method: 'POST', path: '/admin/webhook' },
  { method: 'PUT', path: '/admin/webhook/webhook-1' },
  { method: 'DELETE', path: '/admin/webhook/webhook-1' },
]
for (const { method, path } of paths) {
  for (const headers of [
    {},
    { authorization: 'Bearer invalid' },
    {
      authorization: `Bearer ${jwt.sign({ sub: 'session-1' }, 'session-secret')}`,
    },
    {
      authorization: 'Bearer expired-user-token',
    },
  ]) {
    const response = await app.request(path, { method, headers })
    assert.equal(response.status, 401, `${method} ${path}`)
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Access denied' },
    })
  }
  for (const headers of [
    { cookie: 'session=user', origin: 'http://localhost:5173' },
  ]) {
    const response = await app.request(path, { method, headers })
    assert.equal(response.status, 403, `${method} ${path}, USER`)
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    })
  }
}
assert.equal(records.size, 0)
assert.equal(reloads, 0)
const initial = await app.request('/admin/webhook', { headers: adminHeaders })
assert.equal(initial.status, 200)
assert.deepEqual(await initial.json(), [])
assert.equal(
  (
    await app.request('/admin/webhook', {
      headers: { cookie: 'session=admin' },
    })
  ).status,
  200,
)

for (const body of [
  '{',
  JSON.stringify({ events: {} }),
  JSON.stringify({
    url: 'https://example.com',
    events: { 'messages.update': 'true' },
  }),
]) {
  const invalid = await app.request('/admin/webhook', {
    method: 'POST',
    headers: adminHeaders,
    body,
  })
  assert.equal(invalid.status, 400)
}
assert.equal(reloads, 0)
const created = await app.request('/admin/webhook', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    url: 'https://example.com/webhook',
    events: { 'inbound-message.upsert': true },
    secret: 'first-secret',
    displayName: 'Not a database field',
  }),
})
assert.equal(created.status, 201)
const entitySchema = z.object({
  id: z.string(),
  url: z.string(),
  enabled: z.boolean(),
  events: z.record(z.string(), z.boolean()),
  headers: z.record(z.string(), z.string()),
  secret: z.string().nullable(),
})
const resultSchema = z.object({
  status: z.literal('success'),
  data: entitySchema,
})
const createdRaw = await created.json()
assert.equal(createdRaw.data.secret, 'first-secret')
const createdBody = resultSchema.parse(createdRaw)
assert.equal(createdBody.data.secret, 'first-secret')
assert.equal(createdBody.data.enabled, false)
assert.equal(createdBody.data.events['inbound-message.upsert'], true)
assert.equal(createdBody.data.events['messages.update'], false)
assert.deepEqual(createdBody.data.headers, {})
assert.equal(records.size, 1)
assert.equal(reloads, 1)

const listed = await app.request('/admin/webhook', { headers: adminHeaders })
assert.equal(listed.status, 200)
const listedRaw = await listed.json()
assert.equal(listedRaw[0].secret, 'first-secret')
assert.deepEqual(z.array(entitySchema).parse(listedRaw), [
  createdBody.data,
])
const updated = await app.request('/admin/webhook/webhook-1', {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({
    enabled: true,
    events: { 'messages.update': true },
    headers: { 'X-Webhook-Secret': 'example' },
    displayName: 'Ignored',
  }),
})
assert.equal(updated.status, 200)
const updatedRaw = await updated.json()
assert.equal(updatedRaw.data.secret, 'first-secret')
const updatedBody = resultSchema.parse(updatedRaw)
assert.equal(updatedBody.data.secret, 'first-secret')
assert.equal(updatedBody.data.enabled, true)
assert.equal(updatedBody.data.events['messages.update'], true)
assert.equal(updatedBody.data.events['inbound-message.upsert'], false)
assert.deepEqual(updatedBody.data.headers, { 'X-Webhook-Secret': 'example' })
assert.equal(reloads, 2)

for (const secret of ['second-secret', null]) {
  const response = await app.request('/admin/webhook/webhook-1', {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ secret }),
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.secret, secret)
}
for (const body of [
  { secret: '' },
  { headers: { 'x-zappaz-webhook-secret': 'override' } },
  { headers: { 'X-Zappaz-Webhook-Secret': 'override' } },
]) {
  const response = await app.request('/admin/webhook/webhook-1', {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify(body),
  })
  assert.equal(response.status, 400)
}

for (const method of ['PUT', 'DELETE']) {
  const response = await app.request('/admin/webhook/missing', {
    method,
    headers: adminHeaders,
    ...(method === 'PUT' ? { body: '{}' } : {}),
  })
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Global webhook not found' },
  })
}
assert.equal(reloads, 4)
const removed = await app.request('/admin/webhook/webhook-1', {
  method: 'DELETE',
  headers: adminHeaders,
})
assert.equal(removed.status, 200)
assert.equal(records.size, 0)
assert.equal(reloads, 5)
assert.equal(
  (
    await app.request('/admin/api/v1/session/session-1/webhook', {
      headers: adminHeaders,
    })
  ).status,
  404,
)
