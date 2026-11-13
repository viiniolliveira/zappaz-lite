import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const contactId = '00000000-0000-4000-8000-000000000001'
const calls: string[][] = []
const prisma = {
  waSession: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      where.id === 'session-a'
        ? { id: 'session-a', userId: 'owner' }
        : where.id === 'session-b'
          ? { id: 'session-b', userId: 'other' }
          : null,
  },
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      role: 'USER',
      banned: false,
    }),
  },
}
mock.module('@server/db/prisma', () => ({ prisma }))
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/lib/auth.ts', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('cookie')?.replace('session=', '')
        return id ? { user: { id } } : null
      },
    },
  },
}))
mock.module('../../server/src/modules/contacts/service.ts', () => ({
  deleteContact: () => {
    throw new Error('unexpected')
  },
  listContacts: () => {
    throw new Error('unexpected')
  },
  saveContact: () => {
    throw new Error('unexpected')
  },
  saveExistingContact: () => {
    throw new Error('unexpected')
  },
  updateContact: () => {
    throw new Error('unexpected')
  },
  refreshContactAvatar: async (session: string, id: string) => {
    calls.push([session, id])
    return { id, sessionId: session, avatarUrl: null, avatarCheckedAt: '2025-01-01T00:00:00.000Z' }
  },
}))
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/contacts/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
const request = (
  session: string,
  cookie?: string,
  origin = 'http://localhost:5173',
  id = contactId,
) =>
  app.request(`/api/v1/session/${session}/contacts/${id}/avatar`, {
    method: 'POST',
    headers: { origin, ...(cookie ? { cookie: `session=${cookie}` } : {}) },
  })
assert.equal((await request('unknown', 'owner')).status, 401)
assert.equal((await request('session-a')).status, 401)
assert.equal((await request('session-a', 'other')).status, 401)
assert.equal((await request('session-b', 'owner')).status, 401)
assert.equal((await request('session-a', 'owner', 'https://evil.example')).status, 403)
assert.equal(
  (await request('session-a', 'owner', 'http://localhost:5173', 'not-a-uuid')).status,
  400,
)
assert.equal(calls.length, 0)
const response = await request('session-a', 'owner')
assert.equal(response.status, 200)
assert.deepEqual(await response.json(), {
  status: 'success',
  data: {
    id: contactId,
    sessionId: 'session-a',
    avatarUrl: null,
    avatarCheckedAt: '2025-01-01T00:00:00.000Z',
  },
})
assert.deepEqual(calls, [['session-a', contactId]])
