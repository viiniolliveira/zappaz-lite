import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { createStore } from 'jotai/vanilla'

mock.module('sonner', () => ({ toast: { error() {}, success() {} } }))
const calls: Array<{ origin: string; options: { path: string; withCredentials: boolean; transports: string[] } }> = []
mock.module('socket.io-client', () => ({ io: (origin: string, options: { path: string; withCredentials: boolean; transports: string[] }) => {
  calls.push({ origin, options })
  return { io: { on() {}, off() {} }, on() {}, off() {}, connect() {}, disconnect() {}, removeAllListeners() {}, connected: false }
} }))
const eventWindow = Object.assign(new EventTarget(), { location: { origin: 'https://browser.example' } })
const eventDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' })
Object.assign(globalThis, { window: eventWindow, document: eventDocument })
const { api, request, API_URL } = await import('../../src/lib/api-client.ts')
assert.equal(API_URL, '')
api.defaults.adapter = async config => {
  assert.equal(config.baseURL, '')
  assert.equal(config.url, '/api/v1/example')
  assert.equal(config.withCredentials, true)
  return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config }
}
assert.deepEqual(await request('/api/v1/example'), { ok: true })

const { realtimeAppEffectAtom } = await import('../../src/atoms/realtime-app.ts')
const store = createStore()
const stopApp = store.sub(realtimeAppEffectAtom, () => {})
const { chatSessionIdAtom } = await import('../../src/atoms/ui.ts')
const { realtimeChatEffectAtom } = await import('../../src/atoms/realtime-chat.ts')
store.set(chatSessionIdAtom, 'session-a')
const stopChat = store.sub(realtimeChatEffectAtom, () => {})
await new Promise(resolve => setTimeout(resolve, 20))
assert.equal(calls.length, 1)
assert.equal(calls[0].origin, 'https://browser.example')
assert.equal(calls[0].options.path, '/api/ws')
assert.equal(calls[0].options.withCredentials, true)
assert.deepEqual(calls[0].options.transports, ['websocket'])
stopChat()
stopApp()
