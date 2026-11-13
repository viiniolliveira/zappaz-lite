import { mock } from 'bun:test'

mock.module('sonner', () => ({ toast: { success() {}, error() {} } }))

import assert from 'node:assert/strict'
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query'
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

const { api } = await import('../../src/lib/api-client.ts')
const { getWebhookLogsAtom } = await import('../../src/atoms/webhook.ts')
const calls: number[] = []
api.defaults.adapter = async (config) => {
  calls.push(Number(config.params?.page))
  return {
    data: { status: 'success', data: [], page: config.params?.page, pageSize: 25, total: 0 },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}
client.mount()
const page1 = getWebhookLogsAtom({ sessionId: 'session-a', webhookId: 'hook-a', page: 1 })
const page2 = getWebhookLogsAtom({ sessionId: 'session-a', webhookId: 'hook-a', page: 2 })
const stop1 = store.sub(page1, () => {})
const stop2 = store.sub(page2, () => {})
const wait = () => new Promise((resolve) => setTimeout(resolve, 25))
await wait()
assert.deepEqual(calls.sort(), [1, 2])
const queries = client
  .getQueryCache()
  .findAll({ queryKey: ['webhooks', 'logs', 'session-a', 'hook-a'] })
assert.equal(queries.length, 2)
for (const query of queries) {
  assert.equal(query.options.refetchOnWindowFocus, false)
  assert.equal(query.options.refetchOnReconnect, false)
}
calls.length = 0
focusManager.setFocused(false)
focusManager.setFocused(true)
await wait()
onlineManager.setOnline(false)
onlineManager.setOnline(true)
await wait()
assert.deepEqual(calls, [])
stop1()
stop2()
stop()
client.unmount()
client.clear()
focusManager.setFocused(undefined)
onlineManager.setOnline(true)
