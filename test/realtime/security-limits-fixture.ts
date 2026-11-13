import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'

let now = 100_000
Date.now = () => now
let sessionQueries = 0
let authQueries = 0
let holdAuth = false
let resolveAuth: (() => void) | undefined
let blocked = false
const pending: Array<(value: unknown) => void> = []
const session = { id: 'session-a', userId: 'owner', enabled: true }
const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'USER' }),
  },
  waSession: {
    findUnique: async () => {
      sessionQueries++
      if (blocked) return new Promise((resolve) => pending.push(resolve))
      return session
    },
  },
  webhook: { findFirst: async () => ({ id: 'hook' }) },
}
mock.module('../../server/src/db/prisma.ts', () => ({ prisma }))
mock.module('@server/db/prisma', () => ({ prisma }))
mock.module('@server/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        authQueries++
        if (holdAuth)
          await new Promise<void>((resolve) => {
            resolveAuth = resolve
          })
        return headers.get('cookie') === 'session=owner' ? { user: { id: 'owner' } } : null
      },
      verifyApiKey: async ({ body }: { body: { key: string } }) => {
        authQueries++
        return ['key-one', 'key-two'].includes(body.key)
          ? { valid: true, key: { referenceId: 'owner', permissions: { global: ['sessions'] } } }
          : { valid: false, key: null }
      },
    },
  },
}))
mock.module('../../server/src/services/whatsapp.ts', () => ({
  whatsappService: {
    isSessionConnected: () => true,
    getChatSyncState: () => ({}),
    acknowledgeHistorySyncError() {},
    subscribeConversationPresence: async () => true,
  },
}))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { error() {}, warn() {}, info() {} },
}))

const { createRealtimeBudgets } = await import('../../server/src/realtime/limits.ts')
const { registerRealtimeHandlers } = await import('../../server/src/realtime/handlers.ts')

function harness() {
  let middleware!: (socket: TestSocket, next: (error?: Error) => void) => void
  let connect!: (socket: TestSocket) => void
  const io = {
    use(fn: typeof middleware) {
      middleware = fn
    },
    on(_: string, fn: typeof connect) {
      connect = fn
    },
  }
  registerRealtimeHandlers(io as never, (socket) => socket.handshake.address)
  return {
    async handshake(socket: TestSocket) {
      return new Promise<Error | undefined>((resolve) => middleware(socket, resolve))
    },
    connect,
  }
}
class TestSocket extends EventEmitter {
  handshake: { auth: object; query: object; headers: Record<string, string>; address: string }
  conn = Object.assign(new EventEmitter(), { readyState: 'open' })
  data: { headers?: Headers; sessions?: Set<string> } = {}
  connected = true
  constructor(headers: Record<string, string>, address: string) {
    super()
    this.handshake = { auth: {}, query: {}, headers, address }
  }
  disconnect() {
    this.connected = false
    super.emit('disconnect')
    return this
  }
  call(event: string, body: unknown) {
    return new Promise<Record<string, unknown>>((resolve) => super.emit(event, body, resolve))
  }
}
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

// The fixed-size identity table evicts idle entries only, never active users.
{
  const budgets = createRealtimeBudgets()
  const active = budgets('active')
  assert.ok(active)
  const release = active.connect()
  assert.ok(release)
  for (let i = 1; i < 10_000; i++) assert.ok(budgets(`id-${i}`))
  assert.equal(budgets('overflow'), undefined)
  now += 60_000
  assert.ok(budgets('new'))
  assert.equal(budgets('active'), active)
  release()
  now += 60_000
  assert.notEqual(budgets('active'), active)
}

// Idle cleanup preserves an in-flight identity, and release is idempotent.
{
  const budgets = createRealtimeBudgets()
  const active = budgets('in-flight')
  assert.ok(active)
  const finish = active.begin()
  assert.ok(finish)
  now += 60_000
  assert.equal(budgets('in-flight'), active)
  finish()
  finish()
  const releases = Array.from({ length: 4 }, () => active.begin())
  assert.ok(releases.every(Boolean))
  assert.equal(active.begin(), undefined)
  for (const release of releases) release?.()
}

// Five connections across credentials belong to one user; close releases once.
{
  const h = harness()
  const sockets = Array.from(
    { length: 6 },
    (_, i) =>
      new TestSocket(i % 2 ? { 'x-api-key': 'key-one' } : { cookie: 'session=owner' }, `addr-${i}`),
  )
  for (const socket of sockets.slice(0, 5)) assert.equal(await h.handshake(socket), undefined)
  const rejected = await h.handshake(sockets[5])
  assert.equal((rejected as Error & { data: { code: string } }).data.code, 'RATE_LIMITED')
  sockets[0].conn.emit('close')
  sockets[0].disconnect()
  assert.equal(await h.handshake(sockets[5]), undefined)
  for (const socket of sockets) socket.disconnect()
}

// A reconnect or a different API key cannot reset the user's operation window.
{
  const h = harness()
  const first = new TestSocket({ 'x-api-key': 'key-one' }, 'one')
  const second = new TestSocket({ 'x-api-key': 'key-two' }, 'two')
  assert.equal(await h.handshake(first), undefined)
  h.connect(first)
  assert.equal(await h.handshake(second), undefined)
  h.connect(second)
  for (let i = 0; i < 27; i++) {
    const result = await (i % 2 ? first : second).call('chat.session.unsubscribe', {
      sessionId: 'session-a',
    })
    assert.equal(result.ok, true)
  }
  first.disconnect()
  const reconnect = new TestSocket({ cookie: 'session=owner' }, 'three')
  assert.equal(await h.handshake(reconnect), undefined)
  h.connect(reconnect)
  const before = sessionQueries
  const rejected = await second.call('chat.session.subscribe', { sessionId: 'session-a' })
  assert.equal((rejected.error as { code: string }).code, 'RATE_LIMITED')
  assert.equal(sessionQueries, before)
  reconnect.disconnect()
  second.disconnect()
}

// Four pending operations across two sockets; acknowledgements are rejected before DB work.
{
  const h = harness()
  const a = new TestSocket({ cookie: 'session=owner' }, 'a')
  const b = new TestSocket({ 'x-api-key': 'key-two' }, 'b')
  assert.equal(await h.handshake(a), undefined)
  h.connect(a)
  assert.equal(await h.handshake(b), undefined)
  h.connect(b)
  assert.ok(a.data.sessions)
  assert.ok(b.data.sessions)
  a.data.sessions.add('session-a')
  b.data.sessions.add('session-a')
  blocked = true
  const body = { sessionId: 'session-a', errorId: '123e4567-e89b-42d3-a456-426614174000' }
  const work = [
    a.call('chat.sync.acknowledge', body),
    b.call('chat.sync.acknowledge', body),
    a.call('chat.sync.acknowledge', body),
    b.call('chat.sync.acknowledge', body),
  ]
  assert.equal(pending.length, 4)
  const waiting = new TestSocket({ cookie: 'session=owner' }, 'third-address')
  const throttled = await h.handshake(waiting)
  assert.equal((throttled as Error & { data: { code: string } }).data.code, 'RATE_LIMITED')
  const before = sessionQueries
  assert.deepEqual(await a.call('chat.sync.acknowledge', body), { ok: false })
  assert.deepEqual(
    await b.call('chat.presence.subscribe', {
      sessionId: 'session-a',
      conversationId: body.errorId,
    }),
    { ok: false },
  )
  const logResult = await b.call('logs.subscribe', { sessionId: 'session-a', webhookId: 'hook' })
  assert.equal((logResult.error as { code: string }).code, 'RATE_LIMITED')
  assert.equal(sessionQueries, before)
  blocked = false
  for (const resolve of pending.splice(0)) resolve(session)
  assert.deepEqual(await Promise.all(work), Array(4).fill({ ok: true }))
  await tick()
  assert.equal(await h.handshake(waiting), undefined)
  waiting.disconnect()
  assert.deepEqual(await a.call('chat.sync.acknowledge', body), { ok: true })
  a.disconnect()
  b.disconnect()
}

// An unavailable transport address fails closed before touching authentication.
{
  const h = harness()
  const socket = new TestSocket({ cookie: 'session=owner' }, '')
  const before = authQueries
  assert.ok(await h.handshake(socket))
  assert.equal(authQueries, before)
}

// Address admission rejects repeated unauthenticated handshakes before authentication work.
{
  const h = harness()
  for (let i = 0; i < 30; i++) {
    const error = await h.handshake(new TestSocket({}, 'shared-address'))
    assert.equal((error as Error & { data: { code: string } }).data.code, 'UNAUTHORIZED')
    await tick()
  }
  const before = authQueries
  const rejected = await h.handshake(new TestSocket({}, 'shared-address'))
  assert.equal((rejected as Error & { data: { code: string } }).data.code, 'RATE_LIMITED')
  assert.equal(authQueries, before)
  now += 10_000
  assert.ok(await h.handshake(new TestSocket({}, 'shared-address')))
  assert.equal(authQueries, before + 1)
}

// Authorization refresh runs every 15 seconds and does not overlap an unfinished refresh.
{
  const h = harness()
  const socket = new TestSocket({ cookie: 'session=owner' }, 'timer')
  assert.equal(await h.handshake(socket), undefined)
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  let callback: (() => void) | undefined
  let interval = 0
  let cleared = false
  globalThis.setInterval = ((fn: () => void, ms: number) => {
    callback = fn
    interval = ms
    return { unref() {} }
  }) as typeof setInterval
  globalThis.clearInterval = (() => {
    cleared = true
  }) as typeof clearInterval
  try {
    h.connect(socket)
    assert.equal(interval, 15_000)
    holdAuth = true
    const before = authQueries
    assert.ok(callback)
    callback()
    callback()
    assert.equal(authQueries, before + 1)
    holdAuth = false
    assert.ok(resolveAuth)
    resolveAuth()
    await tick()
    callback()
    assert.equal(authQueries, before + 2)
    await tick()
    socket.disconnect()
    assert.equal(cleared, true)
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
}

// Unsubscribe invalidates a pending subscription without waiting for its DB query.
{
  const h = harness()
  const socket = new TestSocket({ cookie: 'session=owner' }, 'race')
  assert.equal(await h.handshake(socket), undefined)
  h.connect(socket)
  blocked = true
  let subscribedAck = false
  socket.emit('chat.session.subscribe', { sessionId: 'session-a' }, () => {
    subscribedAck = true
  })
  assert.equal(pending.length, 1)
  assert.equal((await socket.call('chat.session.unsubscribe', { sessionId: 'session-a' })).ok, true)
  blocked = false
  const resolveSubscription = pending.shift()
  assert.ok(resolveSubscription)
  resolveSubscription(session)
  await tick()
  assert.equal(subscribedAck, false)
  assert.ok(socket.data.sessions)
  assert.equal(socket.data.sessions.has('session-a'), false)
  assert.equal((await socket.call('chat.session.subscribe', { sessionId: 'session-a' })).ok, true)
  socket.disconnect()
}
assert.ok(authQueries > 0)
