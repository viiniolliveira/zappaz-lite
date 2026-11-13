import { prisma } from '@db/prisma'
import type { Prisma } from '@generated/prisma'

/** Storage I/O must not hold the session-wide ingestion lock. */
export async function withConversationMediaLock<T>(
  sessionId: string,
  conversationId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(
    async (tx) => {
      const sessionKey = `media-session:${sessionId}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${sessionKey}, 0))`
      const key = `media:${sessionId}:${conversationId}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
      return action(tx)
    },
    { timeout: 90000 },
  )
}
