import { mock } from 'bun:test'

mock.module('sonner', () => ({ toast: { success() {}, error() {} } }))

import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'

const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
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
    const set = listeners.get(name) ?? new Set()
    set.add(fn)
    listeners.set(name, set)
    return this
  },
  off(name: string, fn: (...args: unknown[]) => void) {
    listeners.get(name)?.delete(fn)
    return this
  },
  connect() {
    return this
  },
  disconnect() {
    this.connected = false
    return this
  },
  removeAllListeners() {
    listeners.clear()
    return this
  },
}
mock.module('socket.io-client', () => ({ io: () => socket }))
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), { location: { origin: 'http://example.test' } }),
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
})
const { realtimeAppEffectAtom } = await import('../../src/atoms/realtime-app.ts')
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
const store = createStore()
store.set(queryClientAtom, client)
const stop = store.sub(realtimeAppEffectAtom, () => {})
const fire = (name: string, payload?: unknown) => {
  for (const fn of listeners.get(name) ?? []) fn(payload)
}
socket.connected = true
fire('connect')
const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const keys = {
  list: ['sessions', 'list'],
  a: ['sessions', 'detail', a],
  b: ['sessions', 'detail', b],
  hookA: ['webhooks', 'list', a],
  hookB: ['webhooks', 'list', b],
  quickA: ['chat', a, 'quick-messages'],
  quickB: ['chat', b, 'quick-messages'],
  labelsA: ['chat', a, 'labels'],
}
const reset = () => {
  for (const key of Object.values(keys)) client.setQueryData(key, { value: true })
}
const invalid = (key: string[]) => client.getQueryState(key)?.isInvalidated
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))
const event = (resource: string, sessionId: string, eventId: string) => ({
  version: 1,
  eventId,
  resource,
  sessionId,
  webhookId: null,
  deleted: false,
})
reset()
fire('app.invalidate', { invalid: true })
const missingWebhook = event('sessions', a, crypto.randomUUID())
const { webhookId: _missing, ...withoutWebhookId } = missingWebhook
fire('app.invalidate', withoutWebhookId)
fire('app.invalidate', { ...event('sessions', a, crypto.randomUUID()), version: 2 })
fire('app.invalidate', event('unknown', a, crypto.randomUUID()))
await settle()
for (const key of Object.values(keys)) assert.equal(invalid(key), false)
fire('app.invalidate', event('sessions', a, crypto.randomUUID()))
await settle()
assert.equal(invalid(keys.list), true)
assert.equal(invalid(keys.a), true)
assert.equal(invalid(keys.b), false)
assert.equal(invalid(keys.hookA), false)
reset()
fire('app.invalidate', event('webhooks', a, crypto.randomUUID()))
await settle()
assert.equal(invalid(keys.hookA), true)
assert.equal(invalid(keys.hookB), false)
assert.equal(invalid(keys.list), false)
reset()
fire('app.invalidate', event('quick-messages', a, crypto.randomUUID()))
await settle()
assert.equal(invalid(keys.quickA), true)
assert.equal(invalid(keys.quickB), false)
assert.equal(invalid(keys.labelsA), false)
assert.equal(invalid(keys.hookA), false)
assert.equal(invalid(keys.list), false)
reset()
socket.connected = false
fire('disconnect', 'transport close')
socket.connected = true
fire('connect')
await settle()
assert.equal(invalid(keys.list), true)
assert.equal(invalid(keys.hookA), true)
stop()
client.clear()
