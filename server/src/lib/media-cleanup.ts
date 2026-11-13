import { prisma } from '@db/prisma'
import { config } from '../config.ts'
import { logger } from './logger.ts'
import { getMediaStorage, mediaStorageKey } from './media-storage.ts'

/** Inventory is the durable retry source, including files orphaned by cascades. */
export async function reconcileMediaFiles() {
  const storage = getMediaStorage(config.mediaStorage)
  if (!storage) return
  let paginationToken: string | undefined
  do {
    const page = await storage.disk.listAll(undefined, {
      recursive: true,
      paginationToken,
    })
    for (const object of page.objects) {
      if (!object.isFile) continue
      const parts = object.key.split('/')
      if (parts.length !== 3) continue
      let sessionId: string, conversationId: string, messageId: string
      try {
        ;[sessionId, conversationId, messageId] = parts.map((part) =>
          part.startsWith('!') ? Buffer.from(part.slice(1), 'base64url').toString() : part,
        ) as [string, string, string]
      } catch {
        continue
      }
      try {
        if (mediaStorageKey(sessionId, conversationId, messageId) !== object.key) continue
      } catch {
        continue
      }
      const metadata = await object.getMetaData()
      // Never race a recent upload whose DB commit has not completed yet.
      if (metadata.lastModified.getTime() > Date.now() - 86400000) continue
      const message = await prisma.waMessage.findFirst({
        where: { sessionId, conversationId, messageId },
      })
      if (message && !message.deletedAt) continue
      try {
        await storage.disk.delete(object.key)
      } catch (error) {
        logger.error({
          err: error,
          msg: 'Media orphan cleanup failed; inventory will retry',
        })
      }
    }
    paginationToken = page.paginationToken
  } while (paginationToken)
}
