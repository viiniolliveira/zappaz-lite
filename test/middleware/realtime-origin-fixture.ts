import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { Hono } from 'hono'

mock.module('@server/config.ts', () => ({
  config: { appUrl: 'http://localhost:5173', isProduction: false },
}))
mock.module('@server/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get('cookie') === 'user=owner' ? { user: { id: 'owner' } } : null,
    },
  },
}))
mock.module('@server/db/prisma', () => ({
  prisma: { user: { findUnique: async () => ({ id: 'owner', role: 'USER', banned: false }) } },
}))
const { authMiddleware, requireSessionAuth } = await import('../../server/src/middleware/auth.ts')
const { onAppInvalidation, publishAppInvalidation } = await import(
  '../../server/src/lib/app-events.ts'
)
const changes: Array<{ origin?: unknown }> = []
const stop = onAppInvalidation(async (change) => {
  changes.push(change)
})
const app = new Hono()
app.post('/user', authMiddleware, async (c) => {
  await Promise.resolve()
  publishAppInvalidation({ resource: 'sessions', sessionId: 'session-a', ownerId: 'owner' })
  return c.text('ok')
})
app.post(
  '/session',
  async (c, next) => {
    c.set('session' as never, { id: 'session-a', userId: 'owner' } as never)
    await next()
  },
  requireSessionAuth,
  (c) => {
    publishAppInvalidation({ resource: 'sessions', sessionId: 'session-a', ownerId: 'owner' })
    return c.text('ok')
  },
)
const headers = {
  origin: 'http://localhost:5173',
  cookie: 'user=owner',
  'X-Realtime-Socket-Id': 'origin-socket',
}
for (const path of ['/user', '/session']) {
  assert.equal((await app.request(path, { method: 'POST', headers })).status, 200)
  assert.deepEqual(changes.at(-1)?.origin, { socketId: 'origin-socket', userId: 'owner' })
}
assert.equal(
  (
    await app.request('/user', {
      method: 'POST',
      headers: { origin: headers.origin, cookie: headers.cookie },
    })
  ).status,
  200,
)
assert.equal(changes.at(-1)?.origin, undefined)
assert.equal(
  (
    await app.request('/session', {
      method: 'POST',
      headers: { authorization: 'Bearer valid', 'X-Realtime-Socket-Id': 'forged' },
    })
  ).status,
  401,
)
assert.equal(changes.at(-1)?.origin, undefined)
stop()
