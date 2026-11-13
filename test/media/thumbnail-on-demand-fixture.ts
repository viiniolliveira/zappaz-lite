import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import sharp from 'sharp'
import type { ChatChange } from '../../server/src/lib/chat-events.ts'

const enabled = process.env.MEDIA_STORAGE_ENABLED === 'true'
const bytes = await sharp({
  create: { width: 640, height: 480, channels: 3, background: '#654321' },
})
  .png()
  .toBuffer()
const media = {
  id: 'media',
  sessionId: 'session',
  conversationId: 'conversation',
  messageId: 'message',
  kind: 'image',
  thumbnailBase64: null as string | null,
  storage: null,
  key: null,
  mimeType: 'image/png',
  fileName: null,
  storageStatus: 'not_saved',
  message: { id: 'message', messageId: 'wa-message', rawContent: { key: { id: 'wa-message' } } },
}
let downloads = 0
let thumbnailUpdates = 0
let messageRevisions = 0
let puts = 0
let deleted = false
const published: ChatChange[] = []
const tx = {
  waMessageMedia: {
    findFirst: async () => (deleted ? null : media),
    updateMany: async ({
      where,
      data,
    }: {
      where: { sessionId: string; conversationId: string; OR: unknown[] }
      data: { thumbnailBase64: string }
    }) => {
      assert.equal(where.sessionId, media.sessionId)
      assert.equal(where.conversationId, media.conversationId)
      assert.deepEqual(where.OR, [{ thumbnailBase64: null }, { thumbnailBase64: '' }])
      if (deleted || media.thumbnailBase64) return { count: 0 }
      media.thumbnailBase64 = data.thumbnailBase64
      thumbnailUpdates++
      return { count: 1 }
    },
    update: async ({ data }: { data: { storage?: string; key?: string } }) => {
      if (data.storage) Object.assign(media, data)
    },
  },
  waMessage: {
    update: async () => {
      messageRevisions++
    },
  },
  waConversation: { findFirst: async () => ({ id: 'conversation' }), update: async () => {} },
}
const disk = {
  exists: async () => puts > 0,
  getMetaData: async () => ({ contentLength: bytes.length }),
  getBytes: async () => bytes,
  put: async (key: string, data: Buffer) => {
    assert.equal(key, 'session/conversation/wa-message')
    assert.deepEqual(data, bytes)
    puts++
  },
}
mock.module('@db/prisma', () => ({ prisma: tx }))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { warn: () => {}, error: () => {} },
}))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  chatTransaction: async (_id: string, work: (client: typeof tx) => Promise<unknown>) => work(tx),
}))
mock.module('../../server/src/lib/chat-media-lock.ts', () => ({
  withConversationMediaLock: async (
    _s: string,
    _c: string,
    work: (client: typeof tx) => Promise<unknown>,
  ) => work(tx),
}))
mock.module('../../server/src/lib/media-storage.ts', () => ({
  getMediaStorage: () => (enabled ? { name: process.env.MEDIA_STORAGE_DRIVER === 'fs' ? 'local' : 's3', disk } : null),
  mediaStorageKey: (...parts: string[]) => parts.join('/'),
}))
mock.module('../../server/src/services/whatsapp.ts', () => ({
  whatsappService: {
    isSessionEnabled: () => true,
    isSessionConnected: () => true,
    downloadConversationMedia: async (session: string, raw: unknown) => {
      assert.equal(session, 'session')
      assert.deepEqual(raw, media.message.rawContent)
      downloads++
      return bytes
    },
  },
}))
const { onChatChange, publishChatChange } = await import('../../server/src/lib/chat-events.ts')
const stop = onChatChange(async (change) => {
  if (change.source === 'update') published.push(change)
})
const { retrieveChatMedia } = await import(
  '../../server/src/lib/chat-media.ts'
)
{
  for (const source of ['history', 'live', 'send'] as const) {
    publishChatChange({ sessionId: 'session', conversationId: 'conversation', messageId: 'message', source })
  }
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(downloads, 0)
  assert.equal(thumbnailUpdates, 0)
  assert.deepEqual(published, [])

  const result = await retrieveChatMedia('session', 'conversation', 'media')
  assert.deepEqual(result.bytes, bytes)
  assert.equal(downloads, 1)
  assert.equal(thumbnailUpdates, 1)
  assert.equal(messageRevisions, enabled ? 3 : 1)
  assert.equal(puts, enabled ? 1 : 0)
  assert.ok(media.thumbnailBase64)
  assert.equal(
    (await new Bun.Image(Buffer.from(media.thumbnailBase64, 'base64')).metadata()).width,
    64,
  )
  assert.ok(Buffer.byteLength(media.thumbnailBase64, 'utf8') <= 4096)
  assert.equal(published.length, enabled ? 3 : 1)

  const whatsappThumbnail = Buffer.alloc(5000, 42).toString('base64')
  media.thumbnailBase64 = whatsappThumbnail
  await retrieveChatMedia('session', 'conversation', 'media')
  assert.equal(downloads, enabled ? 1 : 2)
  assert.equal(puts, enabled ? 1 : 0)
  assert.equal(media.thumbnailBase64, whatsappThumbnail)
  assert.equal(thumbnailUpdates, 1)
  assert.equal(published.length, enabled ? 3 : 1)
  deleted = true
  await assert.rejects(retrieveChatMedia('session', 'conversation', 'media'), /Media not found/)
  stop()
}
