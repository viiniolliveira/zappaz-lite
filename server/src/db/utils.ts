import { prisma } from '@db/prisma'
import type { Prisma } from '@generated/prisma'
import { hashPassword } from 'better-auth/crypto'

export const getPasswordHash = hashPassword

export async function revokeUserApiKeys(userId: string, db: Prisma.TransactionClient = prisma) {
  await db.apikey.deleteMany({ where: { referenceId: userId } })
}
