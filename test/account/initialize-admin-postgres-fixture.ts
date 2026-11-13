import assert from 'node:assert/strict'
import { verifyPassword } from 'better-auth/crypto'
import { prisma } from '../../server/src/db/prisma.ts'
import { initializeAdmin as initializeConfiguredAdmin } from '../../server/src/db/initialize-admin.ts'
import { AdminEnvSchema } from '../../server/src/config-schema.ts'

async function initializeAdmin(env: Record<string, string>) {
  return initializeConfiguredAdmin(AdminEnvSchema.parse(env))
}

const email = 'bootstrap@example.test'
const password = 'initial-password-123'
const credentials = { ADMIN_EMAIL: email, ADMIN_PASSWORD: password }

async function credential(userId: string) {
  return prisma.account.findUniqueOrThrow({ where: { providerId_accountId: { providerId: 'credential', accountId: userId } } })
}

try {
  for (const env of [{}, { ADMIN_EMAIL: email }, { ADMIN_PASSWORD: password }, { ADMIN_EMAIL: 'invalid', ADMIN_PASSWORD: password }]) {
    await assert.rejects(initializeAdmin(env), error => {
      assert.ok(error instanceof Error)
      assert.ok(!error.message.includes(password))
      return true
    })
    assert.equal(await prisma.user.count(), 0)
  }
  for (const value of ['yes', '1', 'TRUE']) {
    await assert.rejects(initializeAdmin({ ...credentials, ADMIN_RESET_PASSWORD: value }))
    assert.equal(await prisma.user.count(), 0)
  }

  const results = await Promise.all([initializeAdmin(credentials), initializeAdmin(credentials)])
  assert.deepEqual(results.sort(), ['created', 'unchanged'])
  assert.equal(await prisma.user.count(), 1)
  const admin = await prisma.user.findUniqueOrThrow({ where: { email } })
  assert.equal(admin.role, 'ADMIN')
  const original = await credential(admin.id)
  assert.ok(original.password)
  assert.notEqual(original.password, password)
  assert.equal(await verifyPassword({ hash: original.password, password }), true)

  for (const env of [{}, { ...credentials, ADMIN_PASSWORD: 'different-password-123', ADMIN_RESET_PASSWORD: 'false' }]) {
    assert.equal(await initializeAdmin(env), 'unchanged')
    assert.equal((await credential(admin.id)).password, original.password)
  }
  await assert.rejects(initializeAdmin({ ...credentials, ADMIN_RESET_PASSWORD: 'invalid' }))
  const other = await prisma.user.create({ data: { email: 'user@example.test', firstName: 'Other', lastName: 'User', role: 'USER' } })
  const session = await prisma.waSession.create({ data: { userId: admin.id, displayName: 'Preserved' } })
  const expiresAt = new Date('2099-01-01T00:00:00Z')
  await prisma.authSession.createMany({ data: [
    { userId: admin.id, token: 'admin-session-1', expiresAt },
    { userId: admin.id, token: 'admin-session-2', expiresAt },
    { userId: other.id, token: 'other-session', expiresAt },
  ] })
  for (const target of ['missing@example.test', other.email]) {
    await assert.rejects(initializeAdmin({ ADMIN_EMAIL: target, ADMIN_PASSWORD: 'new-password-123', ADMIN_RESET_PASSWORD: 'true' }))
    assert.equal((await credential(admin.id)).password, original.password)
    assert.equal(await prisma.authSession.count(), 3)
  }
  const newPassword = 'new-password-123'
  assert.equal(await initializeAdmin({ ADMIN_EMAIL: email, ADMIN_PASSWORD: newPassword, ADMIN_RESET_PASSWORD: 'true' }), 'reset')
  const updated = await credential(admin.id)
  assert.ok(updated.password)
  assert.equal(await verifyPassword({ hash: updated.password, password: newPassword }), true)
  assert.equal(await verifyPassword({ hash: updated.password, password }), false)
  assert.deepEqual(await prisma.authSession.findMany({ select: { token: true } }), [{ token: 'other-session' }])
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role, 'ADMIN')
  assert.equal((await prisma.waSession.findUniqueOrThrow({ where: { id: session.id } })).displayName, 'Preserved')
  assert.equal(await initializeAdmin({ ...credentials }), 'unchanged')
  assert.equal((await credential(admin.id)).password, updated.password)

  // The fixture runs only against the disposable PostgreSQL container.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE')
  await prisma.user.create({ data: { email: 'only-user@example.test', firstName: 'Only', lastName: 'User', role: 'USER' } })
  assert.equal(await initializeAdmin(credentials), 'unchanged')
  assert.equal(await prisma.user.count(), 1)
  assert.equal(await prisma.user.findUnique({ where: { email } }), null)
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE')
  assert.equal(await initializeAdmin({ ...credentials, ADMIN_RESET_PASSWORD: 'true' }), 'created')
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).role, 'ADMIN')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE')
} finally {
  await prisma.$disconnect()
}
