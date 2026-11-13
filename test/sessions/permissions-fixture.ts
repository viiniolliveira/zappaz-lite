import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { Context, Next } from 'hono'

const users = [
  { id: 'owner', role: 'USER' },
  { id: 'other', role: 'USER' },
  { id: 'admin', role: 'ADMIN' },
]
const session = { id: 'session-1', userId: 'owner', enabled: true, displayName: 'Test', config: {} }
let updates = 0
let removals = 0
let historyReads = 0
const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      users.find((user) => user.id === where.id) ?? null,
  },
  waSession: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      where.id === session.id ? session : null,
  },
}
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/db/prisma', () => ({ prisma }))
mock.module('@server/config.ts', () => ({
  config: { appUrl: 'http://localhost:5173', isProduction: false },
}))
mock.module('@server/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('cookie')?.replace('session=', '')
        return users.some((user) => user.id === id) ? { user: { id } } : null
      },
    },
  },
}))
mock.module('@middleware/rate-limiter', () => ({
  rateLimiter: async (_c: Context, next: Next) => next(),
}))
mock.module('@lib/logger', () => ({ logger: { warn: () => {}, error: () => {} } }))
mock.module('@lib/utils', () => ({ waitUntil: async () => {} }))
mock.module('../../server/src/modules/docs/openapi.ts', () => ({
  describeApiRoute: () => async (_c: Context, next: Next) => next(),
}))
mock.module('@services/whatsapp', () => ({
  whatsappService: {
    getSessionQrCode: (id: string) => (id === session.id ? 'current-qr' : null),
    updateSession: async (data: { enabled?: boolean; displayName?: string }) => {
      updates++
      if (data.enabled !== undefined) session.enabled = data.enabled
      if (data.displayName !== undefined) session.displayName = data.displayName
      return session
    },
    removeSession: async () => {
      removals++
    },
  },
}))
mock.module('../../server/src/modules/send-message-history/service.ts', () => ({
  getSendMessageHistory: async () => {
    historyReads++
    return { total: 0, data: {} }
  },
}))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { apiSessionsRouter, adminSessionsRouter } = await import(
  '../../server/src/modules/sessions/route.ts'
)
const { apiSendMessageHistoryRouter } = await import(
  '../../server/src/modules/send-message-history/route.ts'
)
const app = createApp()
app.onError(errorHandler)
app.route('/api/v1', apiSessionsRouter)
app.route('/api/v1', apiSendMessageHistoryRouter)
app.route('/admin', adminSessionsRouter)
const request = (user: string | null, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      origin: 'http://localhost:5173',
      ...(user ? { cookie: `session=${user}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
const path = '/api/v1/session/session-1'
assert.equal((await request('owner', 'POST', `${path}/token/rotate`)).status, 404)
const detail = await request('owner', 'GET', path)
assert.equal(detail.status, 200)
assert.equal((await detail.json()).qrCodeBase64, 'current-qr')
assert.equal((await request('other', 'GET', path)).status, 401)

for (const body of [{ displayName: 'Renamed' }, { config: { ignoreGroups: true } }]) {
  assert.equal((await request('owner', 'PUT', path, body)).status, 200)
}
assert.equal(updates, 2)
for (const enabled of [true, false]) {
  assert.equal((await request('owner', 'PUT', path, { enabled })).status, 403)
  assert.equal(
    (await request('owner', 'PUT', path, { enabled, displayName: 'Forbidden' })).status,
    403,
  )
}
assert.equal(updates, 2)
assert.equal(session.displayName, 'Renamed')
assert.equal((await request('other', 'PUT', path, { displayName: 'Forbidden' })).status, 401)
assert.equal((await request(null, 'PUT', path, {})).status, 401)
assert.equal((await request('owner', 'PUT', '/api/v1/session/unknown', {})).status, 401)
assert.equal(updates, 2)

for (const prefix of ['/api/v1', '/admin']) {
  for (const enabled of [false, true]) {
    assert.equal(
      (await request('admin', 'PUT', `${prefix}/session/session-1`, { enabled })).status,
      200,
    )
    assert.equal(session.enabled, enabled)
  }
}
assert.equal(updates, 6)

assert.equal((await request('other', 'DELETE', `${path}/remove`)).status, 401)
assert.equal((await request(null, 'DELETE', `${path}/remove`)).status, 401)
assert.equal(removals, 0)
for (const user of ['owner', 'admin']) {
  assert.equal((await request(user, 'DELETE', `${path}/remove`)).status, 200)
}
assert.equal(removals, 2)

for (const action of ['archive', 'un-archive']) {
  assert.equal((await request('owner', 'PUT', `/admin/session/session-1/${action}`)).status, 403)
}
const historyPath = `${path}/send-message-history?startDate=2026-11-01&endDate=2026-11-03&granularity=day`
assert.equal((await request('other', 'GET', historyPath)).status, 401)
assert.equal((await request(null, 'GET', historyPath)).status, 401)
assert.equal(historyReads, 0)
for (const user of ['owner', 'admin']) {
  assert.equal((await request(user, 'GET', historyPath)).status, 200)
}
assert.equal(historyReads, 2)
