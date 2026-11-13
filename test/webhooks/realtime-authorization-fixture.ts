import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

let authorized = true
let webhookExists = true
let fail = false
const errors: unknown[] = []
mock.module('../../server/src/db/prisma.ts', () => ({
  prisma: {
    webhook: {
      findFirst: async ({ where }: { where: { id: string; waSessionId: string } }) =>
        webhookExists && where.id === 'hook-a' && where.waSessionId === 'session-a'
          ? { id: 'hook-a' }
          : null,
    },
  },
}))
mock.module('../../server/src/middleware/auth.ts', () => ({
  authorizeSessionById: async () => {
    if (fail) throw new Error('authorization unavailable')
    return authorized
  },
}))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { error: (value: unknown) => errors.push(value) },
}))
const { registerLogHandlers } = await import('../../server/src/realtime/logs.ts')
const { RealtimeBudget } = await import('../../server/src/realtime/limits.ts')
const { pubSub } = await import('../../server/src/lib/pub-sub.ts')
const { webhookLogCreatedChannel } = await import('../../server/src/lib/webhook-log-events.ts')
const handlers = new Map<string, (...args: never[]) => void>()
const emitted: Array<[string, unknown]> = []
const socket = {
  connected: true,
  data: { headers: new Headers(), budget: new RealtimeBudget() },
  on(name: string, fn: (...args: never[]) => void) {
    handlers.set(name, fn)
  },
  once(name: string, fn: (...args: never[]) => void) {
    handlers.set(name, fn)
  },
  emit(name: string, data: unknown) {
    emitted.push([name, data])
  },
}
registerLogHandlers(socket as never)
const call = (name: string, data: unknown) =>
  new Promise<{ ok: boolean; error: { code: string }; data?: unknown }>((resolve) =>
    (
      handlers.get(name) as unknown as (
        data: unknown,
        cb: (value: { ok: boolean; error: { code: string }; data?: unknown }) => void,
      ) => void
    )(data, resolve),
  )
const scope = { sessionId: 'session-a', webhookId: 'hook-a' }
const channel = webhookLogCreatedChannel(scope.sessionId, scope.webhookId)
const log = {
  version: 1 as const,
  type: 'webhook-log.created' as const,
  data: {
    id: 'log-a',
    sessionId: scope.sessionId,
    webhookId: scope.webhookId,
    url: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    response: null,
    event: null,
    webhookDisplayName: null,
    waSessionEventId: null,
    payload: null,
    messageId: null,
  },
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
assert.equal((await call('logs.subscribe', {})).error.code, 'VALIDATION_ERROR')
assert.equal(
  (await call('logs.subscribe', { ...scope, webhookId: 'other' })).error.code,
  'FORBIDDEN',
)
authorized = false
assert.equal((await call('logs.subscribe', scope)).error.code, 'FORBIDDEN')
authorized = true
assert.deepEqual(await call('logs.subscribe', scope), {
  ok: true,
  data: { ...scope, subscribed: true },
})
pubSub.publish(channel, { ...log, data: { ...log.data, sessionId: 'other' } })
await tick()
assert.equal(emitted.length, 0)
pubSub.publish(channel, log)
await tick()
assert.deepEqual(emitted, [['logs.entry', log]])
webhookExists = false
pubSub.publish(channel, log)
await tick()
assert.deepEqual(emitted.at(-1), ['logs.revoked', scope])
assert.equal(socket.connected, true)
const count = emitted.length
pubSub.publish(channel, log)
await tick()
assert.equal(emitted.length, count)
webhookExists = true
await call('logs.subscribe', scope)
fail = true
pubSub.publish(channel, log)
await tick()
assert.equal(errors.length, 1)
assert.equal(emitted.length, count)
fail = false
assert.deepEqual(await call('logs.unsubscribe', scope), {
  ok: true,
  data: { ...scope, subscribed: false },
})
pubSub.publish(channel, log)
await tick()
assert.equal(emitted.length, count)
await call('logs.subscribe', scope)
handlers.get('disconnect')?.()
pubSub.publish(channel, log)
await tick()
assert.equal(emitted.length, count)
