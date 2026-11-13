import { prisma } from '@db/prisma'
import { AppError } from '../common/errors/app-error.ts'
import { config } from '../config.ts'
import { publishChatChange } from './chat-events.ts'
import { createMediaStorage, mediaStorageKey } from './media-storage.ts'

export async function deleteSessionData(sessionId: string) {
  await cleanupSessionData(sessionId, true)
}

export async function clearSessionMessages(sessionId: string) {
  const conversations = await cleanupSessionData(sessionId, false)
  for (const { id: conversationId } of conversations)
    publishChatChange({ sessionId, conversationId, messagesPruned: true })
}

async function cleanupSessionData(sessionId: string, deleteSession: boolean) {
  const driver = config.mediaStorage.driver
  const prefix = `${mediaStorageKey(sessionId, 'conversation', 'file').split('/')[0]}/`
  return prisma.$transaction(
    async (tx) => {
      // Exclude media writers without holding the ingestion lock during storage I/O.
      const mediaLock = `media-session:${sessionId}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${mediaLock}, 0))`
      const media = await tx.waMessageMedia.findMany({
        where: { sessionId },
        distinct: ['storage'],
        select: { storage: true },
      })
      const receipts = await tx.waConversationDeletion.findMany({ where: { sessionId } })
      const storages = new Set([
        driver === 'fs' ? 'local' : 's3',
        ...media.flatMap((item) => (item.storage ? [item.storage] : [])),
        ...receipts.flatMap((item) => item.storages),
      ])
      try {
        for (const name of storages) {
          if (name !== 'local' && name !== 's3')
            throw new Error('Unknown media storage configuration')
          const storage = createMediaStorage({
            ...config.mediaStorage,
            enabled: true,
            driver: name === 'local' ? 'fs' : 's3',
          })
          if (!storage) throw new Error('Media cleanup storage is unavailable')
          // Disk.deleteAll strips the trailing slash, which would match sibling S3 prefixes.
          await storage.disk.driver.deleteAll(prefix)
        }
      } catch (cause) {
        throw new AppError({
          status: 503,
          code: 'STORAGE_UNAVAILABLE',
          message: 'Não foi possível remover todas as mídias da sessão. Tente novamente.',
          cause,
        })
      }
      // Keep rows/storage metadata until file deletion succeeds, so retries remain possible.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`
      if (deleteSession) {
        await tx.baileysAuthState.deleteMany({ where: { sessionId } })
        await tx.webhookLog.deleteMany({ where: { sessionId } })
        await tx.waSession.delete({ where: { id: sessionId } })
        await tx.waConversationDeletion.deleteMany({ where: { sessionId } })
        return []
      }
      const conversations = await tx.waConversation.findMany({
        where: { sessionId },
        select: { id: true },
      })
      await tx.waMessage.deleteMany({ where: { sessionId } })
      await tx.waConversation.updateMany({
        where: { sessionId },
        data: {
          lastMessageId: null,
          lastActivityAt: null,
          lastReadMessageId: null,
          lastReadOrderAt: null,
          unreadCount: 0,
          revision: { increment: 1 },
        },
      })
      await tx.waConversationDeletion.deleteMany({ where: { sessionId } })
      return conversations
    },
    { timeout: 90000 },
  )
}
