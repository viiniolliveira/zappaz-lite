import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const prisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      role: where.id,
      banned: where.id === 'BANNED',
    }),
  },
}
mock.module('@server/db/prisma', () => ({ prisma }))
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
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/media/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
const request = (role?: string) =>
  app.request('/api/v1/media/limits', { headers: role ? { cookie: `session=${role}` } : {} })
assert.equal((await request()).status, 401)
assert.equal((await request('BANNED')).status, 401)
assert.equal((await request('OTHER')).status, 403)
for (const role of ['USER', 'ADMIN']) {
  const response = await request(role)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'success',
    data: { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 },
  })
}
