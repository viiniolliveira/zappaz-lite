import { logger } from '@server/lib/logger'
import { config } from '../config.ts'
import { prisma } from './prisma.ts'
import { AdminSeedSchema } from './seed-config.ts'
import { getPasswordHash } from './utils.ts'

export async function createAdmin(
  credentials = AdminSeedSchema.parse(config.admin),
  db: Pick<typeof prisma, 'user'> = prisma,
) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = credentials
  const id = crypto.randomUUID()
  await db.user.create({
    data: {
      id,
      email: ADMIN_EMAIL,
      firstName: 'Admin',
      lastName: 'Zappaz',
      role: 'ADMIN',
      accounts: {
        create: {
          accountId: id,
          providerId: 'credential',
          password: await getPasswordHash(ADMIN_PASSWORD),
        },
      },
    },
  })
}

if (import.meta.main) {
  try {
    await createAdmin()
    logger.info({ msg: 'Administrator created' })
  } catch (error) {
    logger.error({
      msg: 'Administrator creation failed. Check ADMIN_EMAIL, ADMIN_PASSWORD, database connectivity and whether the email already exists.',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}
