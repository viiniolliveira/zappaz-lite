import { mock } from 'bun:test'

mock.module('sonner', () => ({ toast: { success() {}, error() {} } }))

import assert from 'node:assert/strict'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
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

const { logRevisionAtom } = await import('../../src/atoms/log-updates.ts')
const sessionId = 'session-a',
  webhookId = 'hook-a'
const key = (page: number) => ['webhooks', 'logs', sessionId, webhookId, { page }]
const foreignKey = ['webhooks', 'logs', sessionId, 'other-hook', { page: 1 }]
const history = ['sessions', 'history', sessionId, { granularity: 'day' }]
const otherHistory = ['sessions', 'history', 'session-b', { granularity: 'day' }]
let firstFetches = 0,
  secondFetches = 0
const first = new QueryObserver(client, {
  queryKey: key(1),
  queryFn: async () => ++firstFetches,
  staleTime: Infinity,
})
const second = new QueryObserver(client, {
  queryKey: key(2),
  queryFn: async () => ++secondFetches,
  staleTime: Infinity,
})
const unsubFirst = first.subscribe(() => {})
const unsubSecond = second.subscribe(() => {})
await new Promise((resolve) => setTimeout(resolve, 0))
client.setQueryData(key(3), 'cached page')
client.setQueryData(foreignKey, 'foreign')
client.setQueryData(history, 'usage')
client.setQueryData(otherHistory, 'other usage')
const revision = logRevisionAtom(`${sessionId}:${webhookId}`)
const event = (resource: string, hook: string | null = null) => ({
  version: 1,
  eventId: crypto.randomUUID(),
  resource,
  sessionId,
  webhookId: hook,
  deleted: false,
})
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
fire('app.invalidate', event('logs', null))
await wait(1100)
assert.equal(store.get(revision), 0)
for (let i = 0; i < 5; i++) {
  fire('app.invalidate', event('logs', webhookId))
  fire('app.invalidate', event('usage'))
}
await wait(150)
assert.equal(firstFetches, 1)
assert.equal(store.get(revision), 0)
await wait(1000)
assert.equal(firstFetches, 2)
assert.equal(secondFetches, 1)
assert.equal(client.getQueryState(key(2))?.isInvalidated, true)
assert.equal(client.getQueryState(key(3))?.isInvalidated, true)
assert.equal(client.getQueryState(foreignKey)?.isInvalidated, false)
assert.equal(client.getQueryState(history)?.isInvalidated, true)
assert.equal(client.getQueryState(otherHistory)?.isInvalidated, false)
assert.equal(store.get(revision), 1)
socket.connected = false
fire('disconnect', 'transport close')
socket.connected = true
fire('connect')
await wait(0)
assert.equal(firstFetches, 3)
assert.equal(secondFetches, 1)
assert.equal(store.get(revision), 2)
unsubFirst()
unsubSecond()
stop()
client.clear()
