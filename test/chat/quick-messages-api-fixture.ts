import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { Prisma } from '../../server/generated/prisma/index.js'
import type { SaveQuickMessageInput } from '../../server/src/modules/quick-messages/types.ts'

type Stored = SaveQuickMessageInput & { id: string; sessionId: string; createdAt: Date; updatedAt: Date }
const messages: Stored[] = []
const sessions = [{ id: 'a', userId: 'owner', enabled: false }, { id: 'b', userId: 'other', enabled: false }]
let writes = 0
const duplicate = () => new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7.8.0' })
mock.module('../../server/src/db/prisma.ts', () => ({ prisma: {
  user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: where.id === 'admin' ? 'ADMIN' : 'USER', banned: false }) },
  waSession: {
    findUnique: async ({ where }: { where: { id: string } }) => sessions.find(item => item.id === where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const result = sessions.find(item => item.id === where.id); assert.ok(result); return result },
  },
  waQuickMessage: {
    findMany: async ({ where }: { where: { sessionId: string } }) => messages.filter(item => item.sessionId === where.sessionId).sort((a, b) => a.name.localeCompare(b.name)),
    create: async ({ data }: { data: SaveQuickMessageInput & { sessionId: string } }) => {
      if (messages.some(item => item.sessionId === data.sessionId && item.command === data.command)) throw duplicate()
      const item = { ...data, id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date() }
      messages.push(item); writes++; return item
    },
    updateManyAndReturn: async ({ where, data }: { where: { sessionId: string; id: string }; data: SaveQuickMessageInput }) => {
      const item = messages.find(item => item.sessionId === where.sessionId && item.id === where.id)
      if (!item) return []
      if (messages.some(other => other !== item && other.sessionId === where.sessionId && other.command === data.command)) throw duplicate()
      Object.assign(item, data); writes++; return [item]
    },
    deleteMany: async ({ where }: { where: { sessionId: string; id: string } }) => {
      const index = messages.findIndex(item => item.sessionId === where.sessionId && item.id === where.id)
      if (index === -1) return { count: 0 }
      messages.splice(index, 1); writes++; return { count: 1 }
    },
  },
} }))
mock.module('../../server/src/lib/auth.ts', () => ({ auth: { api: {
  verifyApiKey: async ({ body }: { body: { key: string } }) => ({ valid: true, key: { referenceId: body.key, permissions: { global: ['sessions'] } } }),
  getSession: async () => null,
} } }))
const { createRouter } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { onAppInvalidation } = await import('../../server/src/lib/app-events.ts')
const { default: router } = await import('../../server/src/modules/quick-messages/route.ts')
const changes: string[] = []
const stop = onAppInvalidation(async event => { assert.ok(writes > changes.length); changes.push(event.sessionId); assert.equal(event.resource, 'quick-messages') })
const app = createRouter().onError(errorHandler).route('/', router)
async function request(method: string, session: string, input?: unknown, id = '', key: string | null = 'owner', token?: string) {
  return app.request(`/api/v1/session/${session}/quick-messages${id ? `/${id}` : ''}`, {
    method,
    headers: { ...(key ? { 'x-api-key': key } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  })
}
const input = { name: 'Boas-vindas', command: 'OLA', message: 'Olá!\nComo ajudar?' }
assert.equal((await request('GET', 'a', undefined, '', null)).status, 401)
assert.equal((await request('POST', 'b', input)).status, 401)
assert.equal(writes, 0)
const created = await request('POST', 'a', input)
assert.equal(created.status, 201)
const first = (await created.json() as { data: Stored }).data
assert.equal(first.command, 'ola')
assert.equal((await request('POST', 'a', input)).status, 409)
assert.equal((await request('POST', 'b', input, '', 'admin')).status, 201)
assert.equal((await request('GET', 'b', undefined, '', null, 'token-a')).status, 401)
assert.equal((await request('GET', 'a', undefined, '', null, 'token-a')).status, 401)
assert.equal((await request('PATCH', 'b', input, first.id, 'admin')).status, 404)
assert.equal((await request('DELETE', 'b', undefined, first.id, 'admin')).status, 404)
assert.equal((await request('PATCH', 'a', { ...input, name: 'Alterada', message: 'Novo texto' }, first.id)).status, 200)
const list = await (await request('GET', 'a')).json() as { data: Stored[] }
assert.equal(list.data.length, 1)
assert.equal(list.data[0].name, 'Alterada')
assert.ok(list.data.every(item => item.sessionId === 'a'))
for (const invalid of [{ ...input, command: '/ola' }, { ...input, message: ' ' }, { ...input, sessionId: 'b' }])
  assert.equal((await request('POST', 'a', invalid)).status, 400)
const second = await request('POST', 'a', { ...input, command: 'outra' })
const secondId = (await second.json() as { data: Stored }).data.id
assert.equal((await request('PATCH', 'a', input, secondId)).status, 409)
assert.equal((await request('DELETE', 'a', undefined, first.id)).status, 200)
assert.equal((await request('DELETE', 'a', undefined, first.id)).status, 404)
assert.equal(messages.filter(item => item.sessionId === 'b').length, 1)
assert.deepEqual(changes, ['a', 'b', 'a', 'a', 'a'])
stop()
