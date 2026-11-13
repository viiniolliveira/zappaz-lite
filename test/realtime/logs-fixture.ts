import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import { createStore } from 'jotai/vanilla'

mock.module('sonner', () => ({ toast: { success() {}, error() {}, dismiss() {} } }))
let resolveSnapshot: ((value: unknown) => void) | undefined
let requests = 0
mock.module('../../src/services/webhook.ts', () => ({
  createWebhook() {},
  deleteWebhook() {},
  getWebhooks() {},
  retryWebhookEvent() {},
  updateWebhook() {},
  getWebhookLogs: () => {
    requests++
    return new Promise((resolve) => {
      resolveSnapshot = resolve
    })
  },
}))
const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
const sent: Array<{ name: string; data: unknown }> = []
let ack: ((error: Error | null, data: unknown) => void) | undefined
let disconnects = 0
const socket = {
  connected: true,
  on(name: string, fn: (...args: unknown[]) => void) {
    const set = handlers.get(name) ?? new Set()
    set.add(fn)
    handlers.set(name, set)
    return this
  },
  off(name: string, fn: (...args: unknown[]) => void) {
    handlers.get(name)?.delete(fn)
    return this
  },
  timeout() {
    return this
  },
  emit(name: string, data: unknown, callback?: typeof ack) {
    sent.push({ name, data })
    if (callback) ack = callback
    return this
  },
  disconnect() {
    disconnects++
    return this
  },
}
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), {
    location: { href: 'http://example.test/', origin: 'http://example.test' },
  }),
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
})
const { appSocketAtom } = await import('../../src/atoms/realtime-app.ts')
const logs = await import('../../src/atoms/realtime-logs.ts')
const store = createStore()
store.set(appSocketAtom, socket as never)
store.set(logs.sessionIdAtom, 'session-a')
store.set(logs.webhookIdAtom, 'hook-a')
const fire = (name: string, value?: unknown) => {
  for (const fn of handlers.get(name) ?? []) fn(value)
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const entry = (id: string, sessionId = 'session-a', webhookId = 'hook-a') => ({
  id,
  sessionId,
  webhookId,
  createdAt: '2026-01-01T00:00:00.000Z',
  url: 'https://example.test',
  event: 'messages.upsert',
  response: {},
  payload: {},
  webhookDisplayName: 'Example',
  waSessionEventId: null,
  messageId: null,
})
const envelope = (data: ReturnType<typeof entry>) => ({
  version: 1,
  type: 'webhook-log.created',
  data,
})
const snapshot = (data: ReturnType<typeof entry>[]) => ({
  status: 'success',
  data,
  page: 1,
  pageSize: 50,
  total: data.length,
})
const stop = store.sub(logs.realtimeLogsEffectAtom, () => {})
assert.deepEqual(sent[0], {
  name: 'logs.subscribe',
  data: { sessionId: 'session-a', webhookId: 'hook-a' },
})
assert.equal(requests, 0)
assert.ok(ack)
ack(null, { ok: true, data: { sessionId: 'session-a', webhookId: 'hook-a', subscribed: true } })
await tick()
assert.equal(requests, 1)
fire('logs.entry', envelope(entry('live')))
assert.equal(store.get(logs.selectedLogAtom)?.id, 'live')
assert.ok(resolveSnapshot)
resolveSnapshot(snapshot([entry('old'), entry('live')]))
await tick()
assert.deepEqual(
  new Set(store.get(logs.webhookLogsAtom).map((item) => item.id)),
  new Set(['live', 'old']),
)
assert.equal(store.get(logs.webhookLogsAtom).length, 2)
assert.equal(store.get(logs.selectedLogAtom)?.id, 'live')
fire('logs.entry', envelope(entry('live')))
fire('logs.entry', envelope(entry('wrong-session', 'session-b')))
fire('logs.entry', envelope(entry('wrong-hook', 'session-a', 'hook-b')))
fire('logs.entry', { version: 2, type: 'webhook-log.created', data: entry('invalid') })
assert.deepEqual(
  new Set(store.get(logs.webhookLogsAtom).map((item) => item.id)),
  new Set(['live', 'old']),
)
assert.equal(requests, 1)
for (let i = 0; i < 510; i++) fire('logs.entry', envelope(entry(`id-${i}`)))
assert.equal(store.get(logs.webhookLogsAtom).length, 500)
socket.connected = false
fire('disconnect')
socket.connected = true
fire('connect')
assert.ok(ack)
ack(null, { ok: true, data: { sessionId: 'session-a', webhookId: 'hook-a', subscribed: true } })
await tick()
assert.equal(requests, 2)
assert.ok(resolveSnapshot)
resolveSnapshot(snapshot([entry('reconnected')]))
await tick()
assert.ok(store.get(logs.webhookLogsAtom).some((item) => item.id === 'reconnected'))
assert.equal(store.get(logs.webhookLogsAtom).length, 500)
stop()
assert.ok(sent.some((item) => item.name === 'logs.unsubscribe'))
assert.equal(disconnects, 0)
assert.equal(handlers.get('logs.entry')?.size ?? 0, 0)

// An existing snapshot selects the most recent record regardless of response order.
const stopAgain = store.sub(logs.realtimeLogsEffectAtom, () => {})
assert.ok(ack)
ack(null, { ok: true, data: { sessionId: 'session-a', webhookId: 'hook-a', subscribed: true } })
await tick()
const older = { ...entry('older'), createdAt: '2026-01-01T00:00:00.000Z' }
const newer = { ...entry('newer'), createdAt: '2026-01-02T00:00:00.000Z' }
assert.ok(resolveSnapshot)
resolveSnapshot(snapshot([older, newer]))
await tick()
assert.equal(store.get(logs.selectedLogAtom)?.id, 'newer')
// A manual selection made while a reconnect snapshot is in flight remains selected.
socket.connected = false
fire('disconnect')
socket.connected = true
fire('connect')
assert.ok(ack)
ack(null, { ok: true, data: { sessionId: 'session-a', webhookId: 'hook-a', subscribed: true } })
await tick()
store.set(logs.selectedLogAtom, older)
assert.ok(resolveSnapshot)
resolveSnapshot(snapshot([newer]))
await tick()
assert.equal(store.get(logs.selectedLogAtom)?.id, 'older')
stopAgain()

// A denied subscription never fetches or accepts events and must not close the shared socket.
const previousRequests = requests
const stopDenied = store.sub(logs.realtimeLogsEffectAtom, () => {})
assert.ok(ack)
ack(null, { ok: false, error: { code: 'FORBIDDEN', message: 'denied' } })
await tick()
fire('logs.entry', envelope(entry('unauthorized')))
assert.equal(requests, previousRequests)
assert.deepEqual(store.get(logs.webhookLogsAtom), [])
assert.equal(store.get(logs.selectedLogAtom), null)
assert.equal(disconnects, 0)
stopDenied()
