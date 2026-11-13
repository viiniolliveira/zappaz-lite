import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'

let mode: 'normal' | 'hold' | 'error' | 'denied' = 'normal'
let queries = 0
let active = 0
let peak = 0
const pending: Array<(value: { id: string } | null) => void> = []
mock.module('../../server/src/db/prisma.ts', () => ({
  prisma: {
    webhook: {
      findFirst: async () => {
        queries++
        if (mode === 'error') throw new Error('synthetic database error')
        if (mode === 'denied') return null
        if (mode === 'hold') {
          active++
          peak = Math.max(peak, active)
          try {
            return await new Promise<{ id: string } | null>((resolve) => pending.push(resolve))
          } finally {
            active--
          }
        }
        return { id: 'hook' }
      },
    },
  },
}))
mock.module('../../server/src/middleware/auth.ts', () => ({
  authorizeSessionById: async () => true,
}))
let errors = 0
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: {
    error: () => {
      errors++
    },
  },
}))
const { registerLogHandlers } = await import('../../server/src/realtime/logs.ts')
const { RealtimeBudget } = await import('../../server/src/realtime/limits.ts')
const { pubSub } = await import('../../server/src/lib/pub-sub.ts')
const { webhookLogCreatedChannel } = await import('../../server/src/lib/webhook-log-events.ts')
const budget = new RealtimeBudget()
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const timers = new Map<object, () => void>()
globalThis.setTimeout = ((callback: () => void, delay: number) => {
  assert.equal(delay, 1000)
  const timer = { unref() {} }
  timers.set(timer, callback)
  return timer
}) as typeof setTimeout
globalThis.clearTimeout = ((timer: object) => {
  timers.delete(timer)
}) as typeof clearTimeout
function advanceSecond() {
  const callbacks = [...timers.values()]
  timers.clear()
  for (const callback of callbacks) callback()
}
class TestSocket extends EventEmitter {
  connected = true
  data = { headers: new Headers(), budget }
  call(name: string, body: unknown) {
    return new Promise<{ ok: boolean }>((resolve) => this.emit(name, body, resolve))
  }
  disconnect() {
    this.connected = false
    this.emit('disconnect')
  }
}
const a = new TestSocket(),
  b = new TestSocket()
registerLogHandlers(a as never)
registerLogHandlers(b as never)
const scope = { sessionId: 's', webhookId: 'hook' }
const channel = webhookLogCreatedChannel(scope.sessionId, scope.webhookId)
const log = {
  version: 1 as const,
  type: 'webhook-log.created' as const,
  data: {
    id: 'id',
    sessionId: 's',
    webhookId: 'hook',
    url: null,
    createdAt: '2025-01-01T00:00:00Z',
    response: null,
    event: null,
    webhookDisplayName: null,
    waSessionEventId: null,
    payload: null,
    messageId: null,
  },
}
const resyncs = new Map<TestSocket, unknown[]>([
  [a, []],
  [b, []],
])
let entries = 0,
  revocations = 0
for (const socket of [a, b]) {
  socket.on('app.resync', (event) => resyncs.get(socket)?.push(event))
  socket.on('logs.entry', () => {
    entries++
  })
  socket.on('logs.revoked', () => {
    revocations++
  })
}
const tick = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve()
}
const assertReleased = () => {
  const slots = Array.from({ length: 4 }, () => budget.acquireWork())
  assert.ok(slots.every(Boolean), 'all four slots must be released')
  for (const finish of slots) finish?.()
}
assert.equal((await a.call('logs.subscribe', scope)).ok, true)
await tick()
assert.equal((await b.call('logs.subscribe', scope)).ok, true)
await tick()
mode = 'hold'
const before = queries
for (let i = 0; i < 1000; i++)
  pubSub.publish(channel, { ...log, data: { ...log.data, id: String(i) } })
assert.equal(queries - before, 4)
assert.equal(peak, 4)
assert.equal(active, 4)
assert.equal(timers.size, 2, 'one reconciliation timer per connection')
assert.deepEqual(resyncs.get(a), [])
advanceSecond()
assert.deepEqual(resyncs.get(a), [{ version: 1 }])
assert.deepEqual(resyncs.get(b), [{ version: 1 }])
for (let i = 0; i < 1000; i++) pubSub.publish(channel, log)
assert.equal(timers.size, 2)
advanceSecond()
assert.deepEqual(resyncs.get(a), [{ version: 1 }, { version: 1 }])
assert.deepEqual(resyncs.get(b), [{ version: 1 }, { version: 1 }])
assert.equal((await a.call('logs.unsubscribe', scope)).ok, true)
assert.equal((await b.call('logs.unsubscribe', scope)).ok, true)
mode = 'normal'
for (const resolve of pending.splice(0)) resolve({ id: 'hook' })
await tick()
assert.equal(entries, 0)
assert.equal(active, 0)
const after = queries
await tick()
assert.equal(queries, after, 'dropped notifications must not be replayed')

assert.equal((await a.call('logs.subscribe', scope)).ok, true)
await tick()
mode = 'error'
pubSub.publish(channel, log)
await tick()
assert.equal(errors, 1)
assertReleased()
mode = 'normal'
pubSub.publish(channel, log)
await tick()
assert.equal(entries, 1, 'a failed notification must release its slot')
mode = 'denied'
pubSub.publish(channel, log)
await tick()
assert.equal(revocations, 1)
assertReleased()
mode = 'normal'
assert.equal((await a.call('logs.subscribe', scope)).ok, true)
await tick()
mode = 'hold'
pubSub.publish(channel, log)
assert.equal(active, 1)
const heldSlots = Array.from({ length: 3 }, () => budget.acquireWork())
assert.ok(heldSlots.every(Boolean))
pubSub.publish(channel, log)
assert.equal(timers.size, 1)
a.disconnect()
assert.equal(timers.size, 0, 'disconnect clears pending reconciliation')
advanceSecond()
assert.deepEqual(resyncs.get(a), [{ version: 1 }, { version: 1 }])
for (const finish of heldSlots) finish?.()
mode = 'normal'
pending.shift()?.({ id: 'hook' })
await tick()
assert.equal(entries, 1, 'a disconnected socket cannot receive an in-flight notification')
assert.equal(active, 0)
assertReleased()
assert.equal((await b.call('logs.subscribe', scope)).ok, true)
await tick()
for (let i = 0; i < 35; i++) {
  pubSub.publish(channel, log)
  await tick()
}
assert.equal(entries, 36, 'server notifications must not consume client attempt budget')
assert.equal((await b.call('logs.unsubscribe', scope)).ok, true)
b.disconnect()

globalThis.setTimeout = originalSetTimeout
globalThis.clearTimeout = originalClearTimeout
