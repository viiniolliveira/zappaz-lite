import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'

let finishUpdate!: () => void
let updateStarted!: () => void
const started = new Promise<void>(resolve => { updateStarted = resolve })
const persist = new Promise<void>(resolve => { finishUpdate = resolve })
let persistedStatus = 'open'
mock.module('@db/prisma', () => ({ prisma: { globalWebhook: { findMany: async () => [] }, waSession: {
  update: async ({ where, data }: { where: { id: string }; data: { status: string; jid: null; connectedAt: null; disconnectedAt: Date } }) => {
    assert.equal(where.id, 'logout-session')
    assert.equal(data.jid, null)
    assert.equal(data.connectedAt, null)
    assert.ok(data.disconnectedAt instanceof Date)
    updateStarted()
    await persist
    persistedStatus = data.status
  },
} } }))
let cleanupCalls = 0
mock.module('../../server/src/lib/session-deletion.ts', () => ({ deleteSessionData: async () => {}, clearSessionMessages: async (id: string) => { assert.equal(id, 'logout-session'); cleanupCalls++ } }))
const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const session = new WhatsappSession('logout-session', false, CreateSessionConfigSchema.parse({}), 'Test', null)
// The socket emits no connection.update: explicit logout must still persist its state.
let remoteLogoutCalls = 0
Object.defineProperty(session, 'client', { value: { logout: async () => { remoteLogoutCalls++ }, ws: { close: () => {} } }, writable: true })
Object.defineProperty(session, '_status', { value: 'open', writable: true })
let finishEvent!: () => void
const event = new Promise<void>(resolve => { finishEvent = resolve })
const pendingEvents = Reflect.get(session, 'pendingEvents') as Set<Promise<void>>
pendingEvents.add(event)
let completed = false
const logout = session.logout().then(() => { completed = true })
const concurrentLogout = session.logout()
await started
assert.equal(completed, false)
assert.equal(persistedStatus, 'open')
finishUpdate()
await Promise.resolve()
assert.equal(cleanupCalls, 0)
finishEvent()
await logout
await concurrentLogout
assert.equal(persistedStatus, 'close')
assert.equal(session.status, 'close')
assert.equal(remoteLogoutCalls, 1)
assert.equal(cleanupCalls, 1)
