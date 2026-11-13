import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'

let cleanup = 0
let socketLogouts = 0
let closes = 0
mock.module('@db/prisma', () => ({ prisma: {
  globalWebhook: { findMany: async () => [] },
  waSession: { update: async () => {} },
} }))
mock.module('../../server/src/lib/session-deletion.ts', () => ({
  deleteSessionData: async () => {},
  clearSessionMessages: async () => { cleanup++ },
}))
const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const makeSession = () => {
  const session = new WhatsappSession('test-session', false, CreateSessionConfigSchema.parse({}), 'Test', null)
  Object.defineProperty(session, 'client', { value: { logout: async () => { socketLogouts++ }, ws: { close: () => { closes++ } } }, writable: true })
  Object.defineProperty(session, 'createClient', { value: () => {}, writable: true })
  return session
}
for (const code of [402, 403, 406, 408]) {
  const session = makeSession()
  session.profilePictureUrl = 'https://example.test/avatar'
  const error = Object.assign(new Error('disconnected'), { output: { statusCode: code } })
  await Reflect.get(session, 'handleConnectionClosed').call(session, 'test-session', { error, date: new Date() })
  assert.equal(cleanup, 0, `disconnect ${code} must not clear messages`)
  assert.equal(session.profilePictureUrl, 'https://example.test/avatar', `disconnect ${code} must preserve the profile picture`)
}
const qrSession = makeSession()
Object.defineProperty(qrSession, '_qrRetries', { value: 100, writable: true })
await Reflect.get(qrSession, 'handleQRCodeReceived').call(qrSession, 'test-session', 'test-qr')
assert.equal(cleanup, 0, 'QR retry exhaustion must not clear messages')
const remote = makeSession()
const error = Object.assign(new Error('logged out'), { output: { statusCode: 401 } })
await Reflect.get(remote, 'handleConnectionClosed').call(remote, 'test-session', { error, date: new Date() })
assert.equal(cleanup, 1)
assert.equal(socketLogouts, 0, 'remote logout must not call socket logout again')
assert.ok(closes >= 2)
