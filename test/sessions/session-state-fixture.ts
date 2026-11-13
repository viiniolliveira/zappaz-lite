import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { Session } from '../../server/src/modules/sessions/types.ts'

let memoryEnabled = false
let connected = false
mock.module('@services/whatsapp', () => ({
  whatsappService: {
    isSessionEnabled: () => memoryEnabled,
    isSessionConnected: () => connected,
  },
}))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { BadRequestError } = await import('../../server/src/common/errors/bad-request-error.ts')
const { requireEnabledSession, requireConnectedSession } = await import(
  '../../server/src/middleware/session.ts'
)

const session: Session = {
  id: 'test-session',
  token: 'test-token',
  secret: 'test-secret',
  status: 'close',
  createdAt: new Date(),
  updatedAt: new Date(),
  disconnectedAt: null,
  connectedAt: null,
  jid: null,
  enabled: true,
  userId: 'test-user',
  profilePictureUrl: null,
  displayName: 'Test',
  archived: false,
}
let storedSession: Session | null = session
const app = createApp()
app.onError((error, c) => {
  assert.ok(error instanceof BadRequestError)
  return c.json({ error: error.message }, 400)
})
app.use('*', async (c, next) => {
  c.set('session', storedSession)
  await next()
})
app.post('/connect', requireEnabledSession, (c) => c.json({ reachedConnect: true }))
app.post('/connected', requireEnabledSession, requireConnectedSession, (c) => c.json({ ok: true }))

for (const enabledInMemory of [false, true]) {
  memoryEnabled = enabledInMemory
  for (const enabledInDatabase of [true, false]) {
    session.enabled = enabledInDatabase
    const response = await app.request('/connect', { method: 'POST' })
    assert.equal(response.status, enabledInDatabase ? 200 : 400)
    assert.deepEqual(
      await response.json(),
      enabledInDatabase ? { reachedConnect: true } : { error: 'Session not enabled' },
    )
  }
}

storedSession = null
assert.equal((await app.request('/connect', { method: 'POST' })).status, 400)

storedSession = session
session.enabled = true
const disconnectedResponse = await app.request('/connected', { method: 'POST' })
assert.equal(disconnectedResponse.status, 400)
assert.deepEqual(await disconnectedResponse.json(), { error: 'Session not connected' })
connected = true
assert.equal((await app.request('/connected', { method: 'POST' })).status, 200)
