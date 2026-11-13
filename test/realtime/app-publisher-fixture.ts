import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

mock.module('../../server/src/middleware/auth.ts', () => ({
  requestUser: async (headers: Headers) => {
    const id = headers.get('x-user')
    const sessionId = headers.get('x-key-session')
    return id ? { id, role: id === 'admin' ? 'ADMIN' : 'USER', ...(sessionId ? { apiKeyScope: { scope: 'session', sessionId } } : {}) } : null
  },
}))
const { runWithRealtimeOrigin, publishAppInvalidation } = await import(
  '../../server/src/lib/app-events.ts'
)
const { registerAppPublisher } = await import('../../server/src/realtime/app-publisher.ts')
const { RealtimeBudget } = await import('../../server/src/realtime/limits.ts')
const budgets = new Map<string, InstanceType<typeof RealtimeBudget>>()
const createSocket = (id: string, user: string) => {
  if (!budgets.has(user)) budgets.set(user, new RealtimeBudget())
  return ({
  id,
  connected: true,
  data: { headers: new Headers({ 'x-user': user }), budget: budgets.get(user) },
  received: [] as unknown[],
  emit(name: string, data: unknown) {
    if (name === 'app.invalidate') this.received.push(data)
  },
})
}
const owner = createSocket('origin', 'owner')
const otherTab = createSocket('other-tab', 'owner')
const otherUserSameSocketId = createSocket('origin', 'other')
const admin = createSocket('admin-socket', 'admin')
const unauthorized = createSocket('unauthorized', 'other')
const offline = createSocket('offline', 'owner')
offline.connected = false
const scoped = createSocket('scoped', 'owner')
scoped.data.headers.set('x-key-session', 'session-a')
const otherScope = createSocket('other-scope', 'owner')
otherScope.data.headers.set('x-key-session', 'session-b')
const scopedAdmin = createSocket('scoped-admin', 'admin')
scopedAdmin.data.headers.set('x-key-session', 'session-b')
const sockets = [owner, otherTab, otherUserSameSocketId, admin, unauthorized, offline, scoped, otherScope, scopedAdmin]
const stop = registerAppPublisher({
  sockets: { sockets: new Map(sockets.map((socket, i) => [i, socket])) },
} as never)
const tick = () => new Promise((resolve) => setImmediate(resolve))
const change = { resource: 'sessions' as const, sessionId: 'session-a', ownerId: 'owner' }
await runWithRealtimeOrigin({ socketId: 'origin', userId: 'owner' }, async () => {
  await Promise.resolve()
  publishAppInvalidation(change)
})
await tick()
assert.equal(owner.received.length, 0)
assert.equal(otherTab.received.length, 1)
assert.equal(admin.received.length, 1)
assert.equal(unauthorized.received.length, 0)
assert.equal(offline.received.length, 0)
assert.equal(scoped.received.length, 1)
assert.equal(otherScope.received.length, 0)
assert.equal(scopedAdmin.received.length, 0)
const event = otherTab.received[0] as Record<string, unknown>
assert.equal(event.version, 1)
assert.match(event.eventId as string, /^[0-9a-f-]{36}$/)
assert.equal(event.resource, 'sessions')
assert.equal(event.sessionId, 'session-a')
assert.equal(event.webhookId, null)
assert.equal(event.deleted, false)
// Explicit null represents an external event, even within a request context.
await runWithRealtimeOrigin({ socketId: 'origin', userId: 'owner' }, async () => {
  publishAppInvalidation({ ...change, origin: null })
})
await tick()
assert.equal(owner.received.length, 1)
// A forged socket ID cannot suppress a connection belonging to another user.
publishAppInvalidation({ ...change, origin: { socketId: 'admin-socket', userId: 'owner' } })
await tick()
assert.equal(admin.received.length, 3)
stop()
publishAppInvalidation(change)
await tick()
assert.equal(admin.received.length, 3)
