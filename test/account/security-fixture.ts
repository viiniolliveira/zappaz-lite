import assert from 'node:assert/strict'
import { mock } from 'bun:test'

let revokedUser: string | null = null
mock.module('@db/prisma', () => ({ prisma: {
  apikey: { deleteMany: async ({ where }: { where: { referenceId: string } }) => { revokedUser = where.referenceId } },
} }))
const { getPasswordHash, revokeUserApiKeys } = await import('../../server/src/db/utils.ts')
await revokeUserApiKeys('owner')
assert.equal(revokedUser, 'owner')
const { verifyPassword } = await import('better-auth/crypto')
const hash = await getPasswordHash(' a password ')
assert.notEqual(hash, ' a password ')
assert.equal(await verifyPassword({ hash, password: ' a password ' }), true)
assert.equal(await verifyPassword({ hash, password: 'a password' }), false)
