import { mock } from 'bun:test'

mock.module('sonner', () => ({ toast: { success() {}, error() {} } }))

import assert from 'node:assert/strict'
import { createStore } from 'jotai/vanilla'

const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
const manager = new Map<string, Set<(...args: unknown[]) => void>>()
let sockets = 0
const socket = {
  id: 'socket-1',
  connected: false,
  io: {
    on(name: string, fn: (...args: unknown[]) => void) {
      const set = manager.get(name) ?? new Set()
      set.add(fn)
      manager.set(name, set)
      return this
    },
    off(name: string, fn: (...args: unknown[]) => void) {
      manager.get(name)?.delete(fn)
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
  emit() {
    return this
  },
  timeout() {
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
    handlers.clear()
    return this
  },
}
mock.module('socket.io-client', () => ({
  io: () => {
    sockets++
    return socket
  },
}))
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), { location: { origin: 'http://example.test' } }),
  document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
})
const { api, request } = await import('../../src/lib/api-client.ts')
const app = await import('../../src/atoms/realtime-app.ts')
const store = createStore()
const stop = store.sub(app.realtimeAppEffectAtom, () => {})
assert.equal(sockets, 1)
const headers: Array<string | undefined> = []
api.defaults.adapter = async (config) => {
  headers.push(config.headers.get('X-Realtime-Socket-Id') as string | undefined)
  return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
}
await request('/example', { method: 'POST' })
socket.connected = true
for (const fn of handlers.get('connect') ?? []) fn()
await request('/example')
await request('/example', { method: 'POST' })
await request('/example', { method: 'PATCH' })
await request('/example', { method: 'DELETE' })
socket.connected = false
for (const fn of handlers.get('disconnect') ?? []) fn('transport close')
await request('/example', { method: 'PUT' })
assert.deepEqual(headers, [undefined, undefined, 'socket-1', 'socket-1', 'socket-1', undefined])
stop()
