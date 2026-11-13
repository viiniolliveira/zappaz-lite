import { prisma } from '@db/prisma'
import type { WAProto } from 'baileys'
import { AppError } from '../common/errors/app-error.ts'
import { NotFoundError } from '../common/errors/not-found-error.ts'
import { config } from '../config.ts'
import { whatsappService } from '../services/whatsapp.ts'
import { publishChatChange } from './chat-events.ts'
import { withConversationMediaLock } from './chat-media-lock.ts'
import { chatTransaction } from './chat-store.ts'
import { generateThumb } from './generate-thumb.ts'
import { logger } from './logger.ts'
import { getMediaStorage, mediaStorageKey } from './media-storage.ts'

const downloads = new Map<
  string,
  Promise<{ bytes: Buffer; mimeType: string | null; fileName: string | null }>
>()

async function assertMediaExists(sessionId: string, conversationId: string, mediaId: string) {
  const exists = await prisma.waMessageMedia.findFirst({
    where: {
      sessionId,
      conversationId,
      id: mediaId,
      message: { deletedAt: null },
    },
    select: { id: true },
  })
  if (!exists) throw new NotFoundError('Media not found')
}

export async function retrieveChatMedia(
  sessionId: string,
  conversationId: string,
  mediaId: string,
  privateOnly = true,
) {
  if (privateOnly) {
    const conversation = await prisma.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
      select: { id: true },
    })
    if (!conversation) throw new NotFoundError('Media not found')
  }
  const identity = JSON.stringify([sessionId, conversationId, mediaId])
  const pending = downloads.get(identity)
  if (pending) return pending
  const task = retrieve(sessionId, conversationId, mediaId, privateOnly)
  downloads.set(identity, task)
  try {
    return await task
  } finally {
    downloads.delete(identity)
  }
}
async function retrieve(
  sessionId: string,
  conversationId: string,
  mediaId: string,
  privateOnly: boolean,
) {
  const media = await prisma.waMessageMedia.findFirst({
    where: {
      sessionId,
      conversationId,
      id: mediaId,
      ...(privateOnly ? { conversation: { isGroup: false } } : {}),
      message: { deletedAt: null },
    },
    include: { message: { select: { id: true, messageId: true, rawContent: true } } },
  })
  if (!media) throw new NotFoundError('Media not found')
  const storage = getMediaStorage(config.mediaStorage)
  if (storage && media.storage && media.key) {
    if (media.storage !== storage.name)
      throw new AppError({
        status: 503,
        code: 'STORAGE_UNAVAILABLE',
        message: 'Media storage configuration changed',
      })
    try {
      if (await storage.disk.exists(media.key)) {
        const metadata = await storage.disk.getMetaData(media.key)
        if (metadata.contentLength > config.mediaMaxFileSizeBytes)
          throw new AppError({
            status: 413,
            code: 'PAYLOAD_TOO_LARGE',
            message: `Media exceeds ${config.mediaMaxFileSizeMb} MiB`,
          })
        const bytes = Buffer.from(await storage.disk.getBytes(media.key))
        if (bytes.length > config.mediaMaxFileSizeBytes)
          throw new AppError({
            status: 413,
            code: 'PAYLOAD_TOO_LARGE',
            message: `Media exceeds ${config.mediaMaxFileSizeMb} MiB`,
          })
        await saveMissingThumbnail(media, bytes)
        await assertMediaExists(sessionId, conversationId, mediaId)
        return {
          bytes,
          mimeType: media.mimeType,
          fileName: media.fileName,
        }
      }
    } catch (cause) {
      if (cause instanceof AppError) throw cause
      throw new AppError({
        status: 503,
        code: 'STORAGE_UNAVAILABLE',
        message: 'Media storage is unavailable',
        cause,
      })
    }
  }
  if (!whatsappService.isSessionEnabled(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_ENABLED',
      message: 'Session is disabled',
    })
  if (!whatsappService.isSessionConnected(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_CONNECTED',
      message: 'Session is disconnected',
    })
  const bytes = await whatsappService.downloadConversationMedia(
    sessionId,
    // rawContent is the Baileys payload stored by storeChatMessage.
    media.message.rawContent as unknown as WAProto.IWebMessageInfo,
  )
  if (!bytes)
    throw new AppError({
      status: 404,
      code: 'MEDIA_UNAVAILABLE',
      message: 'Media is no longer available',
    })
  await saveMissingThumbnail(media, bytes)
  if (storage) {
    const key = mediaStorageKey(sessionId, conversationId, media.message.messageId)
    try {
      await chatTransaction(sessionId, async (tx) => {
        await tx.waMessageMedia.update({
          where: { id: media.id },
          data: { storageStatus: 'pending', revision: { increment: 1 } },
        })
        await tx.waMessage.update({
          where: { id: media.message.id },
          data: { revision: { increment: 1 } },
        })
        await tx.waConversation.update({
          where: { id: conversationId },
          data: { revision: { increment: 1 } },
        })
      })
      publishChatChange({
        sessionId,
        conversationId,
        messageId: media.message.id,
        mediaId: media.id,
        source: 'update',
      })
      await withConversationMediaLock(sessionId, conversationId, async (tx) => {
        // Deletion uses this same lock. Never write a file after its row was deleted.
        const current = await tx.waMessageMedia.findFirst({
          where: {
            sessionId,
            conversationId,
            id: mediaId,
            message: { deletedAt: null },
          },
          select: { id: true },
        })
        if (!current) throw new NotFoundError('Media not found')
        await storage.disk.put(key, bytes, {
          contentType: media.mimeType ?? 'application/octet-stream',
        })
        await tx.waMessageMedia.update({
          where: { id: media.id },
          data: {
            storage: storage.name,
            key,
            persistedAt: new Date(),
            storageStatus: 'ready',
            revision: { increment: 1 },
          },
        })
        await tx.waMessage.update({
          where: { id: media.message.id },
          data: { revision: { increment: 1 } },
        })
        await tx.waConversation.update({
          where: { id: conversationId },
          data: { revision: { increment: 1 } },
        })
      })
      publishChatChange({
        sessionId,
        conversationId,
        messageId: media.message.id,
        mediaId: media.id,
        source: 'update',
      })
    } catch (error) {
      logger.error({
        err: error,
        msg: 'Media persistence failed',
        sessionId,
        mediaId,
      })
      await chatTransaction(sessionId, async (tx) => {
        const updated = await tx.waMessageMedia.updateMany({
          where: { id: media.id },
          data: { storageStatus: 'failed', revision: { increment: 1 } },
        })
        if (!updated.count) return
        await tx.waMessage.update({
          where: { id: media.message.id },
          data: { revision: { increment: 1 } },
        })
        await tx.waConversation.update({
          where: { id: conversationId },
          data: { revision: { increment: 1 } },
        })
      })
      publishChatChange({
        sessionId,
        conversationId,
        messageId: media.message.id,
        mediaId: media.id,
        source: 'update',
      })
    }
  }
  await assertMediaExists(sessionId, conversationId, mediaId)
  return {
    bytes,
    mimeType: media.mimeType,
    fileName: media.fileName,
  }
}

async function saveMissingThumbnail(
  media: {
    id: string
    sessionId: string
    conversationId: string
    messageId: string
    kind: string
    thumbnailBase64: string | null
  },
  bytes: Buffer,
) {
  if (media.kind !== 'image' || media.thumbnailBase64) return
  try {
    const thumbnail = await generateThumb(bytes)
    const updated = await chatTransaction(media.sessionId, async (tx) => {
      const result = await tx.waMessageMedia.updateMany({
        where: {
          id: media.id,
          sessionId: media.sessionId,
          conversationId: media.conversationId,
          OR: [{ thumbnailBase64: null }, { thumbnailBase64: '' }],
          message: { deletedAt: null },
        },
        data: { ...thumbnail, revision: { increment: 1 } },
      })
      if (!result.count) return false
      await tx.waMessage.update({
        where: { id: media.messageId },
        data: { revision: { increment: 1 } },
      })
      return true
    })
    if (updated)
      publishChatChange({
        sessionId: media.sessionId,
        conversationId: media.conversationId,
        messageId: media.messageId,
        mediaId: media.id,
        source: 'update',
      })
  } catch (error) {
    logger.warn({
      err: error,
      sessionId: media.sessionId,
      mediaId: media.id,
      msg: 'Thumbnail generation failed',
    })
  }
}
