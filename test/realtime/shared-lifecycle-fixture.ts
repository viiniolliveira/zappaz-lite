import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import { createStore } from 'jotai/vanilla'

mock.module('sonner', () => ({ toast: { success() {}, error() {}, dismiss() {} } }))
mock.module('../../src/services/webhook.ts', () => ({
  createWebhook() {},
  deleteWebhook() {},
  getWebhooks() {},
  retryWebhookEvent() {},
  updateWebhook() {},
  getWebhookLogs: async () => ({ status: 'success', data: [], page: 1, pageSize: 50, total: 0 }),
}))
let created = 0,
  disconnects = 0
const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
const emitted: Array<{ name: string; payload: unknown }> = []
const socket = {
  connected: false,
  id: 'socket-a',
  io: {
    on() {
      return this
    },
    off() {
      return this
    },
  },
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
  emit(name: string, payload: unknown, ack?: (error: null, value: unknown) => void) {
    emitted.push({ name, payload })
    if (ack && name === 'chat.session.subscribe')
      ack(null, { ok: true, data: { sessionId: 'session-a', subscribed: true } })
    if (ack && name === 'logs.subscribe')
      ack(null, {
        ok: true,
        data: { sessionId: 'session-a', webhookId: 'hook-a', subscribed: true },
      })
    return this
  },
  connect() {
    return this
  },
  disconnect() {
    disconnects++
    this.connected = false
    return this
  },
  removeAllListeners() {
    handlers.clear()
    return this
  },
}
mock.module('socket.io-client', () => ({
  io: () => {
    created++
    return socket
  },
}))
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), { location: { origin: 'http://example.test' } }),
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
})
const app = await import('../../src/atoms/realtime-app.ts')
const chat = await import('../../src/atoms/realtime-chat.ts')
const ui = await import('../../src/atoms/ui.ts')
const logs = await import('../../src/atoms/realtime-logs.ts')
const store = createStore()
const stopApp = store.sub(app.realtimeAppEffectAtom, () => {})
socket.connected = true
for (const fn of handlers.get('connect') ?? []) fn()
store.set(ui.chatSessionIdAtom, 'session-a')
const stopChat = store.sub(chat.realtimeChatEffectAtom, () => {})
store.set(logs.sessionIdAtom, 'session-a')
store.set(logs.webhookIdAtom, 'hook-a')
const stopLogs = store.sub(logs.realtimeLogsEffectAtom, () => {})
await new Promise((resolve) => setTimeout(resolve, 0))
assert.equal(created, 1)
assert.ok(emitted.some((item) => item.name === 'chat.session.subscribe'))
assert.ok(emitted.some((item) => item.name === 'logs.subscribe'))
stopLogs()
assert.ok(emitted.some((item) => item.name === 'logs.unsubscribe'))
assert.equal(disconnects, 0)
stopChat()
assert.ok(emitted.some((item) => item.name === 'chat.session.unsubscribe'))
assert.equal(disconnects, 0)
assert.equal(store.get(app.appSocketAtom), socket)
stopApp()
assert.equal(disconnects, 1)
