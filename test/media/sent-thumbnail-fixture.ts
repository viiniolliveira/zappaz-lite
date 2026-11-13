import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { proto } from 'baileys'
import type { Prisma } from '../../server/generated/prisma/client.ts'
import { sentVideoThumbnail } from './sent-video-thumbnail.ts'

const conversation = { id: 'conversation', contactId: 'contact', isGroup: false, lastActivityAt: null, lastMessageId: null }
const savedMedia: Prisma.WaMessageMediaUncheckedCreateInput[] = []
const savedMessages: Prisma.WaMessageUncheckedCreateInput[] = []
const tx = {
  $executeRaw: async () => 0,
  waConversation: { upsert: async () => conversation, update: async () => conversation },
  waMessage: {
    findUnique: async () => null,
    create: async ({ data }: { data: Prisma.WaMessageUncheckedCreateInput }) => {
      savedMessages.push(data)
      return { ...data, id: 'message-record', orderAt: new Date('2026-11-02T20:18:33.000Z') }
    },
  },
  waMessageMedia: { create: async ({ data }: { data: Prisma.WaMessageMediaUncheckedCreateInput }) => { savedMedia.push(data); return data } },
}
mock.module('@db/prisma', () => ({ prisma: { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }))
const identity = await import('../../server/src/lib/chat-identity.ts')
mock.module('../../server/src/lib/chat-identity.ts', () => ({
  ...identity,
  ensureChatContact: async () => ({ contact: { id: 'contact', jid: '5511900000000@s.whatsapp.net' }, changed: false }),
  messageContactIdentifiers: () => [],
  contactJids: () => [],
  conversationIdentityWhere: () => { throw new Error('Unexpected identity lookup') },
}))
const events = await import('../../server/src/lib/chat-events.ts')
mock.module('../../server/src/lib/chat-events.ts', () => ({ ...events, publishChatChange: () => {} }))
const { storeChatMessage } = await import('../../server/src/lib/chat-store.ts')
const input = {
  key: { id: 'video-example', fromMe: true, remoteJid: '5511900000000@s.whatsapp.net' },
  status: 'PENDING',
  messageTimestamp: '1793650713',
  message: { videoMessage: { caption: 'Vídeo de teste enviado pela Zappaz.', mimetype: 'video/mp4', fileLength: '2848208', jpegThumbnail: sentVideoThumbnail } },
}
for (const source of ['send', 'live'] as const) {
  const message = proto.WebMessageInfo.fromObject(input)
  const saved = await storeChatMessage('session', message, source)
  assert.ok(saved)
  const media = savedMedia.at(-1)
  assert.equal(media?.thumbnailBase64, sentVideoThumbnail)
  assert.equal(media?.thumbnailMimeType, 'image/jpeg')
  assert.equal(media?.thumbnailWidth, 32)
  assert.equal(media?.thumbnailHeight, 18)
  assert.equal(media?.kind, 'video')
  assert.equal(media?.messageId, saved.id)
}
assert.equal(savedMessages.length, 2)
assert.equal(Buffer.byteLength(sentVideoThumbnail, 'base64'), 776)
const place = { url: 'www.google.com', name: 'Google São Paulo', address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil' }
await storeChatMessage('session', proto.WebMessageInfo.fromObject({ ...input, message: { locationMessage: place } }), 'send')
assert.equal(savedMessages.at(-1)?.type, 'location')
const content = savedMessages.at(-1)?.content
assert.ok(content && typeof content === 'object' && !Array.isArray(content))
assert.deepEqual(content.location, { ...place, thumbnail: null })
