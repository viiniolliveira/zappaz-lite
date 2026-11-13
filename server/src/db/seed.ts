import { config } from '../config.ts'

import { prisma } from './prisma.ts'
import { AdminSeedSchema } from './seed-config.ts'
import { getPasswordHash } from './utils.ts'

async function clearDatabase() {
  // This explicitly destructive CLI reset must also replace the last admin.
  await prisma.$executeRaw`TRUNCATE TABLE "User", "WaSession" CASCADE`
}

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = AdminSeedSchema.parse(config.admin)
  const password = await getPasswordHash(ADMIN_PASSWORD)
  const id = crypto.randomUUID()

  await clearDatabase()

  const user = await prisma.user.create({
    data: {
      id,
      email: ADMIN_EMAIL,
      firstName: 'Admin',
      lastName: 'Zappaz',
      role: 'ADMIN',
      accounts: {
        create: { accountId: id, providerId: 'credential', password },
      },
    },
  })

  console.log('Admin user created:', user.email)

  console.log('Seeding finished.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
