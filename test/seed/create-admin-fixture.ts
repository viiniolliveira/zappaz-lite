import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { verifyPassword } from 'better-auth/crypto'

const existing = { email: 'existing@example.com', role: 'USER' }
const users: Array<Record<string, unknown>> = [existing]
const prisma = {
  user: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      if (users.some((user) => user.email === data.email)) throw new Error('duplicate email')
      users.push(data)
      return data
    },
  },
}
mock.module('../../server/src/db/prisma.ts', () => ({ prisma }))
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/db/prisma', () => ({ prisma }))

process.env.ADMIN_EMAIL = 'admin@example.com'
process.env.ADMIN_PASSWORD = 'a secure password'
const { createAdmin } = await import('../../server/src/db/create-admin.ts')
const { AdminSeedSchema } = await import('../../server/src/config-schema.ts')
await createAdmin()
assert.equal(users.length, 2)
assert.deepEqual(users[0], existing)
assert.equal(users[1].email, 'admin@example.com')
assert.equal(users[1].role, 'ADMIN')
const account = (users[1].accounts as { create: { accountId: string; providerId: string; password: string } }).create
assert.equal(typeof users[1].id, 'string')
assert.equal(account.accountId, users[1].id)
assert.equal(account.providerId, 'credential')
assert.notEqual(account.password, process.env.ADMIN_PASSWORD)
assert.equal(await verifyPassword({ password: process.env.ADMIN_PASSWORD, hash: account.password }), true)
await assert.rejects(createAdmin())
assert.equal(users.length, 2)
assert.throws(() => AdminSeedSchema.parse({ ADMIN_EMAIL: 'invalid', ADMIN_PASSWORD: 'a secure password' }))
assert.equal(users.length, 2)
