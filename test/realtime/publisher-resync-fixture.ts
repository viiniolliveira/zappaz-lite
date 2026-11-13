import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { EventEmitter } from 'node:events'

mock.module('../../server/src/db/prisma.ts', () => ({
  prisma: { waSession: { findUnique: async () => ({ id: 's', userId: 'u' }) } },
}))
mock.module('../../server/src/middleware/auth.ts', () => ({
  requestUser: async () => ({ id: 'u', role: 'USER' }),
  authorizeSession: async () => true,
  authenticateRealtime: async () => true,
  authorizeSessionById: async () => true,
}))
mock.module('../../server/src/services/whatsapp.ts', () => ({ whatsappService: {} }))
mock.module('../../server/src/lib/logger.ts', () => ({ logger: { error() {} } }))
const { RealtimeBudget } = await import('../../server/src/realtime/limits.ts')
const { registerAppPublisher } = await import('../../server/src/realtime/app-publisher.ts')
const { registerChatPublisher } = await import('../../server/src/realtime/publisher.ts')
const { publishAppInvalidation } = await import('../../server/src/lib/app-events.ts')
const { publishChatChange } = await import('../../server/src/lib/chat-events.ts')
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
class Socket extends EventEmitter {
  id = 'socket'
  connected = true
  data = { headers: new Headers(), sessions: new Set(['s']), budget: new RealtimeBudget() }
  disconnect() {
    this.connected = false
    this.emit('disconnect')
  }
}
const socket = new Socket()
const events: unknown[] = []
socket.on('app.resync', (event) => events.push(event))
let privateEvents = 0
socket.on('chat.typing', () => {
  privateEvents++
})
socket.on('app.invalidate', () => {
  privateEvents++
})
const io = { sockets: { sockets: new Map([['socket', socket]]) } }
const stopApp = registerAppPublisher(io as never)
const stopChat = registerChatPublisher(io as never)
const change = { resource: 'sessions' as const, sessionId: 's', ownerId: 'u' }
const typing = { sessionId: 's', typing: { conversationId: 'private-id' } }
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
try {
  const slots = Array.from({ length: 4 }, () => socket.data.budget.acquireWork())
  assert.ok(slots.every(Boolean))
  for (let i = 0; i < 1000; i++) {
    publishAppInvalidation(change)
    publishChatChange(typing)
  }
  await tick()
  assert.equal(timers.size, 1, 'chat and app publishers must share one connection timer')
  assert.equal(privateEvents, 0)
  advanceSecond()
  assert.deepEqual(events, [{ version: 1 }])
  for (const finish of slots) finish?.()
  publishAppInvalidation(change)
  publishChatChange(typing)
  await tick()
  assert.equal(privateEvents, 2, 'normal notifications resume after capacity is released')
  assert.equal(timers.size, 0)
  const blocked = Array.from({ length: 4 }, () => socket.data.budget.acquireWork())
  assert.ok(blocked.every(Boolean))
  publishChatChange(typing)
  assert.equal(timers.size, 1)
  socket.disconnect()
  assert.equal(timers.size, 0)
  advanceSecond()
  assert.deepEqual(events, [{ version: 1 }])
  for (const finish of blocked) finish?.()
} finally {
  stopApp()
  stopChat()
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
}
