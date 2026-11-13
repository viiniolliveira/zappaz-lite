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

const sessionId = 'session-a'
const webhookId = 'hook-a'
const logKey = ['webhooks', 'logs', sessionId, webhookId, { page: 1 }]
const usageKey = ['sessions', 'history', sessionId, { granularity: 'day' }]
const pageTwoKey = ['webhooks', 'logs', sessionId, webhookId, { page: 2 }]
let finishLog: ((value: string) => void) | undefined
let finishUsage: ((value: string) => void) | undefined
let logCalls = 0,
  usageCalls = 0,
  secondPageCalls = 0
const signals: AbortSignal[] = []
const logObserver = new QueryObserver(client, {
  queryKey: logKey,
  staleTime: Infinity,
  queryFn: ({ signal }) => {
    logCalls++
    signals.push(signal)
    return logCalls === 1
      ? new Promise<string>((resolve) => {
          finishLog = resolve
        })
      : Promise.resolve('log-new')
  },
})
const usageObserver = new QueryObserver(client, {
  queryKey: usageKey,
  staleTime: Infinity,
  queryFn: ({ signal }) => {
    usageCalls++
    signals.push(signal)
    return usageCalls === 1
      ? new Promise<string>((resolve) => {
          finishUsage = resolve
        })
      : Promise.resolve('usage-new')
  },
})
const secondObserver = new QueryObserver(client, {
  queryKey: pageTwoKey,
  staleTime: Infinity,
  queryFn: async () => ++secondPageCalls,
})
const stopLog = logObserver.subscribe(() => {})
const stopUsage = usageObserver.subscribe(() => {})
const stopSecond = secondObserver.subscribe(() => {})
const event = (resource: string, webhookId: string | null) => ({
  version: 1,
  eventId: crypto.randomUUID(),
  resource,
  sessionId,
  webhookId,
  deleted: false,
})
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
await wait(0)
assert.equal(logCalls, 1)
assert.equal(usageCalls, 1)
assert.equal(secondPageCalls, 1)
for (let i = 0; i < 4; i++) {
  fire('app.invalidate', event('logs', webhookId))
  fire('app.invalidate', event('usage', null))
}
await wait(1100)
assert.equal(logCalls, 1)
assert.equal(usageCalls, 1)
assert.ok(signals.every((signal) => !signal.aborted))
assert.ok(finishLog)
assert.ok(finishUsage)
finishLog('log-old')
finishUsage('usage-old')
await wait(0)
assert.equal(client.getQueryData(logKey), 'log-old')
assert.equal(client.getQueryData(usageKey), 'usage-old')
await wait(1100)
assert.equal(logCalls, 2)
assert.equal(usageCalls, 2)
assert.equal(client.getQueryData(logKey), 'log-new')
assert.equal(client.getQueryData(usageKey), 'usage-new')
assert.equal(secondPageCalls, 1)
assert.ok(signals.every((signal) => !signal.aborted))
await wait(1100)
assert.equal(logCalls, 2)
assert.equal(usageCalls, 2)
stopLog()
stopUsage()
stopSecond()
stop()
client.clear()
