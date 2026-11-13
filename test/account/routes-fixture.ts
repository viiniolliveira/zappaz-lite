import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

const users = [
  { id: 'u1', email: 'user@example.com', firstName: 'User', lastName: 'One', phone: '+5511999999999', role: 'USER' },
  { id: 'a1', email: 'admin@example.com', firstName: 'Admin', lastName: 'One', phone: '+5511888888888', role: 'ADMIN' },
]
mock.module('@server/db/prisma', () => ({ prisma }))
mock.module('@db/prisma', () => ({ prisma }))
const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) => users.find(user => where.id ? user.id === where.id : user.email === where.email) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const user = users.find(item => item.id === where.id)
      if (!user) throw new Error('unknown user')
      Object.assign(user, Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== undefined && key !== 'accounts' && key !== 'authSessions')))
      return { ...user }
    },
  },
}
mock.module('@server/lib/auth.ts', () => ({ auth: { api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get('cookie')?.replace('session=', '')
  return users.some(user => user.id === id) ? { user: { id } } : null
} }, handler: (request: Request) => Response.json({ clientIp: request.headers.get('x-zappaz-client-ip') }) } }))
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: authRouter } = await import('../../server/src/modules/auth/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', authRouter)
const userToken = 'u1'
const adminToken = 'a1'
const request = (path: string, method: string, token?: string, body?: unknown) => app.request(path, {
  method,
  headers: { origin: 'http://localhost:5173', ...(token ? { cookie: `session=${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

// The legacy profile and administrator routes have been removed.
for (const path of ['/api/v1/user', '/admin/users']) assert.equal((await request(path, 'GET', userToken)).status, 404)

const spoofedIpRequest = () => new Request('http://localhost/api/auth/sign-in/email', { method: 'POST', headers: { 'x-zappaz-client-ip': '203.0.113.99' } })
const withoutTrustedIp = await app.request(spoofedIpRequest())
assert.deepEqual(await withoutTrustedIp.json(), { clientIp: null })
const withTrustedIp = await app.request(spoofedIpRequest(), undefined, { clientIp: '192.0.2.10' })
assert.deepEqual(await withTrustedIp.json(), { clientIp: '192.0.2.10' })
