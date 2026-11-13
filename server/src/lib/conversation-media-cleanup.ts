import { prisma } from '@db/prisma'
import { config } from '../config.ts'
import { withConversationMediaLock } from './chat-media-lock.ts'
import { logger } from './logger.ts'
import { createMediaStorage, mediaStorageKey } from './media-storage.ts'

/** Runs even with persistence disabled: deleting previously saved files is explicit. */
export async function cleanupConversationMedia(sessionId: string, conversationId: string) {
  try {
    return await withConversationMediaLock(sessionId, conversationId, async (tx) => {
      const deletion = await tx.waConversationDeletion.findFirst({
        where: { sessionId, conversationId },
      })
      if (!deletion || deletion.filesDeletedAt) return true
      for (const name of deletion.storages) {
        if (name !== 'local' && name !== 's3')
          throw new Error('Unknown media storage configuration')
        const storage = createMediaStorage({
          ...config.mediaStorage,
          enabled: true,
          driver: name === 'local' ? 'fs' : 's3',
        })
        if (!storage) throw new Error('Media cleanup storage is unavailable')
        const prefix = mediaStorageKey(sessionId, conversationId, 'file')
          .split('/')
          .slice(0, 2)
          .join('/')
        await storage.disk.deleteAll(prefix)
      }
      await tx.waConversationDeletion.update({
        where: { conversationId },
        data: { filesDeletedAt: new Date() },
      })
      return true
    })
  } catch (error) {
    logger.error({
      err: error,
      sessionId,
      conversationId,
      msg: 'Conversation media cleanup pending; durable job will retry',
    })
    return false
  }
}

export async function retryConversationMediaCleanup() {
  const jobs = await prisma.waConversationDeletion.findMany({
    where: { filesDeletedAt: null },
    orderBy: { deletedAt: 'asc' },
    take: 50,
  })
  for (const job of jobs) await cleanupConversationMedia(job.sessionId, job.conversationId)
}

export function startConversationMediaCleanup() {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await retryConversationMediaCleanup()
    } catch (error) {
      logger.error({ err: error, msg: 'Conversation cleanup worker failed' })
    } finally {
      running = false
    }
  }
  void run()
  const job = Bun.cron('* * * * *', run).unref()
  return () => job.stop()
}
