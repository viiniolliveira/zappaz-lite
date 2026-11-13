import { config } from '../config.ts'
import type { AdminConfig } from '../config-schema.ts'
import { createAdmin } from './create-admin.ts'
import { prisma } from './prisma.ts'
import { AdminSeedSchema } from './seed-config.ts'
import { getPasswordHash, revokeUserApiKeys } from './utils.ts'

export async function initializeAdmin(admin: AdminConfig = config.admin) {
  const reset = admin.ADMIN_RESET_PASSWORD

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent startup attempts before checking for the first user.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('zappaz:admin-setup', 0))`
    const hasUsers = (await tx.user.count()) > 0
    if (hasUsers && !reset) return 'unchanged' as const

    const parsed = AdminSeedSchema.safeParse(admin)
    if (!parsed.success) {
      throw new Error(
        'Set a valid ADMIN_EMAIL and ADMIN_PASSWORD (8–128 characters) for initial setup or password reset.',
      )
    }
    if (!hasUsers) {
      await createAdmin(parsed.data, tx)
      return 'created' as const
    }

    const user = await tx.user.findUnique({ where: { email: parsed.data.ADMIN_EMAIL } })
    if (user?.role !== 'ADMIN') {
      throw new Error('ADMIN_EMAIL must identify an existing administrator to reset the password.')
    }
    const password = await getPasswordHash(parsed.data.ADMIN_PASSWORD)
    await tx.account.upsert({
      where: { providerId_accountId: { providerId: 'credential', accountId: user.id } },
      create: { providerId: 'credential', accountId: user.id, userId: user.id, password },
      update: { password },
    })
    await tx.authSession.deleteMany({ where: { userId: user.id } })
    await revokeUserApiKeys(user.id, tx)
    return 'reset' as const
  })
}
