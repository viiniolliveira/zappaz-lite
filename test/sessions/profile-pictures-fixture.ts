import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { Boom } from '@hapi/boom'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'

let stored: string | null = null
let failDatabase = false
let updates = 0
const calls: Array<[string, string]> = []
const prisma = {
  globalWebhook: { findMany: async () => [] },
  waSession: {
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>
      data: { profilePictureUrl: string | null }
    }) => {
      assert.equal(where.id, 'session')
      assert.equal(where.status, 'open')
      assert.equal(where.enabled, true)
      assert.equal(where.archived, false)
      assert.deepEqual(
        data.profilePictureUrl === null ? where.profilePictureUrl : where.OR,
        data.profilePictureUrl === null
          ? { not: null }
          : [{ profilePictureUrl: null }, { profilePictureUrl: { not: data.profilePictureUrl } }],
      )
      if (failDatabase) throw new Error('database unavailable')
      if (stored === data.profilePictureUrl) return { count: 0 }
      stored = data.profilePictureUrl
      updates++
      return { count: 1 }
    },
    update: async () => {},
  },
}
mock.module('@db/prisma', () => ({ prisma }))
mock.module('../../server/src/lib/session-deletion.ts', () => ({
  clearSessionMessages: async () => {},
  deleteSessionData: async () => {},
}))
const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const { onAppInvalidation } = await import('../../server/src/lib/app-events.ts')
const appEvents: unknown[] = []
onAppInvalidation(async (event) => {
  appEvents.push(event)
})
const session = new WhatsappSession(
  'session',
  false,
  CreateSessionConfigSchema.parse({}),
  'Test',
  'owner',
)
let result: string | undefined = 'https://new.test/photo'
let error: Error | undefined
let pending: Promise<string | undefined> | undefined
const client = {
  profilePictureUrl: async (jid: string, type: string) => {
    calls.push([jid, type])
    if (pending) return pending
    if (error) throw error
    return result
  },
  ws: { close() {} },
}
Object.assign(session, { client, _status: 'open', jid: '999@s.whatsapp.net' })
const refresh = () => session.refreshProfilePicture()
await refresh()
assert.equal(stored, result)
assert.equal(session.profilePictureUrl, result)
assert.deepEqual(calls[0], ['999@s.whatsapp.net', 'image'])
assert.deepEqual(appEvents, [
  { resource: 'sessions', sessionId: 'session', ownerId: 'owner', origin: null },
])
await refresh()
assert.equal(appEvents.length, 1)
result = 'https://changed.test/photo'
await refresh()
assert.equal(stored, result)
assert.equal(appEvents.length, 2)
result = undefined
await refresh()
assert.equal(stored, null)
assert.equal(appEvents.length, 3)
stored = 'https://old.test/photo'
error = new Boom('missing', { statusCode: 404 })
await refresh()
assert.equal(stored, null)
assert.equal(appEvents.length, 4)
stored = 'https://old.test/photo'
for (const failure of [
  new Error('timeout'),
  new Boom('forbidden', { statusCode: 403 }),
  new Boom('server', { statusCode: 500 }),
]) {
  error = failure
  await refresh()
  assert.equal(stored, 'https://old.test/photo')
  assert.equal(appEvents.length, 4)
}
error = undefined
result = 'https://new.test/photo'
failDatabase = true
const beforeMemory = session.profilePictureUrl
await refresh()
assert.equal(stored, 'https://old.test/photo')
assert.equal(session.profilePictureUrl, beforeMemory)
assert.equal(appEvents.length, 4)
failDatabase = false
let resolve!: (value: string) => void
pending = new Promise((r) => {
  resolve = r
})
const inFlight = refresh()
Object.assign(session, { _status: 'close' })
resolve('https://late.test/photo')
await inFlight
assert.equal(stored, 'https://old.test/photo')
assert.equal(appEvents.length, 4)
pending = undefined
Object.assign(session, { _status: 'open' })
result = 'https://new.test/avatar'
assert.equal(await session.getContactProfilePictureUrl('111@s.whatsapp.net'), result)
assert.deepEqual(calls.at(-1), ['111@s.whatsapp.net', 'image'])
error = new Boom('missing', { statusCode: 404 })
assert.equal(await session.getContactProfilePictureUrl('111@s.whatsapp.net'), null)
error = new Boom('forbidden', { statusCode: 403 })
await assert.rejects(session.getContactProfilePictureUrl('111@s.whatsapp.net'))
assert.equal(updates, 4)

// A response from an obsolete socket or JID must never be persisted.
error = undefined
for (const change of ['socket', 'jid', 'logout', 'deletion']) {
  Object.assign(session, {
    client,
    _status: 'open',
    jid: '999@s.whatsapp.net',
    logoutTask: null,
    markedForDeletion: false,
  })
  pending = new Promise((r) => {
    resolve = r
  })
  const work = refresh()
  if (change === 'socket') Object.assign(session, { client: {} })
  if (change === 'jid') session.jid = '888@s.whatsapp.net'
  if (change === 'logout') Object.assign(session, { logoutTask: Promise.resolve() })
  if (change === 'deletion') Object.assign(session, { markedForDeletion: true })
  resolve('https://stale.test/photo')
  await work
  assert.equal(stored, 'https://old.test/photo')
  assert.equal(appEvents.length, 4)
}
pending = undefined
Object.assign(session, {
  client,
  _status: 'open',
  jid: '999@s.whatsapp.net',
  logoutTask: null,
  markedForDeletion: false,
})
Object.assign(session, { _status: 'close' })
await assert.rejects(session.getContactProfilePictureUrl('111@s.whatsapp.net'))

// Opening persists the JID before refreshing the session picture, without scanning contacts.
const opening = new WhatsappSession(
  'opening',
  false,
  CreateSessionConfigSchema.parse({}),
  'Test',
  'owner',
)
const sequence: string[] = []
Object.assign(opening, { client: { user: { id: '123:1@s.whatsapp.net' } }, _status: 'close' })
Object.defineProperty(opening, 'forwardEvent', { value: () => {} })
Object.defineProperty(opening, 'updatePersistentSessionData', {
  value: async (data: { status: string; jid: string }) => {
    assert.equal(data.status, 'open')
    assert.equal(data.jid, '123@s.whatsapp.net')
    sequence.push('persist')
  },
})
Object.defineProperty(opening, 'refreshProfilePicture', {
  value: async () => {
    sequence.push('session')
  },
})
Object.defineProperty(opening, 'refreshContactProfilePictures', {
  value: async () => {
    sequence.push('contacts')
  },
})
await Reflect.get(opening, 'onConnectionUpdate').call(opening, { connection: 'open' })
assert.deepEqual(sequence, ['persist', 'session'])

// Remote logout clears the persisted and in-memory URL.
const loggingOut = new WhatsappSession(
  'logout',
  false,
  CreateSessionConfigSchema.parse({}),
  'Test',
  'owner',
)
let logoutData: Record<string, unknown> | undefined
Object.assign(loggingOut, {
  client: { ws: { close() {} } },
  _status: 'open',
  _profilePictureUrl: 'https://old.test/photo',
})
Object.defineProperty(loggingOut, 'updatePersistentSessionData', {
  value: async (data: Record<string, unknown>) => {
    logoutData = data
  },
})
Object.defineProperty(loggingOut, 'clearCache', { value: async () => {} })
await loggingOut.logout(true)
assert.equal(loggingOut.profilePictureUrl, null)
assert.equal(logoutData?.profilePictureUrl, null)
assert.equal(logoutData?.status, 'close')
