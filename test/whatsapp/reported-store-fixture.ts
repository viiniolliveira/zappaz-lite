import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import type { WaMessage, WaMessageMedia } from '@generated/prisma'
import { proto } from 'baileys'
import sharp from 'sharp'

const rows: WaMessage[] = []
const files = new Map<string, WaMessageMedia>()
const conversationId = randomUUID()
const sessionId = randomUUID()
const now = new Date('2026-11-05T12:00:00.000Z')
const tx = {
  $executeRaw: async () => 0,
  waConversationDeletion: { findFirst: async () => null },
  waConversation: {
    upsert: async () => ({ id: conversationId, isGroup: true, lastActivityAt: null }),
    update: async () => ({}),
  },
  waMessage: {
    findUnique: async ({
      where,
    }: {
      where: { sessionId_conversationId_messageId: { messageId: string } }
    }) =>
      rows.find((row) => row.messageId === where.sessionId_conversationId_messageId.messageId) ??
      null,
    findFirst: async ({
      where,
    }: {
      where: { sessionId: string; messageId: string; conversation: unknown }
    }) => {
      assert.equal(where.sessionId, sessionId)
      assert.ok(where.conversation, 'updates must be conversation-scoped')
      return rows.find((row) => row.messageId === where.messageId) ?? null
    },
    create: async ({ data }: { data: WaMessage }) => {
      const row: WaMessage = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        revision: 1,
        editedAt: null,
        deletedAt: null,
        clientRequestId: data.clientRequestId ?? null,
        senderName: data.senderName ?? null,
        senderJid: data.senderJid ?? null,
        status: data.status ?? null,
        text: data.text ?? null,
        sentAt: data.sentAt ?? null,
      }
      rows.push(row)
      return row
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string }
      data: Partial<WaMessage> & { revision: { increment: number } }
    }) => {
      const row = rows.find((item) => item.id === where.id)
      assert.ok(row)
      const { revision, ...changes } = data
      Object.assign(row, changes, { revision: row.revision + revision.increment })
      return row
    },
  },
  waMessageMedia: {
    create: async ({ data }: { data: WaMessageMedia }) => {
      const saved = {
        ...data,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        revision: 1,
        fileName: data.fileName ?? null,
        size: data.size ?? null,
        duration: data.duration ?? null,
        voice: data.voice ?? false,
        storageStatus: 'not_saved',
        storage: null,
        key: null,
        persistedAt: null,
      }
      files.set(data.messageId, saved)
      return saved
    },
  },
}
mock.module('@db/prisma', () => ({
  prisma: { $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx) },
}))

const { storeChatMessage, updateChatMessage } = await import('../../server/src/lib/chat-store.ts')
const { messageDTO } = await import('../../server/src/lib/chat-dto.ts')
const { messageSchema } = await import('../../src/lib/chat/schemas.ts')
const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#abc' } })
  .jpeg()
  .toBuffer()
const key = { id: 'nested', remoteJid: 'scope@g.us' }
const input = {
  key,
  message: {
    templateMessage: {
      interactiveMessageTemplate: {
        header: { imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg } },
        body: { text: 'Corpo' },
        nativeFlowMessage: {
          buttons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Sim","id":"yes"}' }],
        },
      },
    },
  },
}
const mediaMessage = await storeChatMessage(sessionId, input, 'history')
assert.ok(mediaMessage)
assert.deepEqual(mediaMessage.rawContent, JSON.parse(JSON.stringify(input)))
const mediaDTO = messageDTO({ ...mediaMessage, media: files.get(mediaMessage.id) ?? null })
assert.equal(mediaDTO.type, 'image')
assert.equal(mediaDTO.media?.thumbnail?.base64, jpeg.toString('base64'))
assert.equal(mediaDTO.interactive?.buttons[0].id, 'yes')
assert.ok(messageSchema.safeParse(mediaDTO).success)

const pollMessage = await storeChatMessage(
  sessionId,
  {
    key: { ...key, id: 'poll' },
    message: {
      pollCreationMessageV3: {
        name: 'Jantar?',
        options: [{ optionName: 'Pizza' }],
        selectableOptionsCount: 1,
      },
    },
  },
  'history',
  'own@lid',
)
assert.ok(pollMessage)
const poll = messageDTO({ ...pollMessage, media: null }).poll
assert.ok(poll)
const vote = {
  pollUpdateMessageKey: { fromMe: true },
  senderTimestampMs: 1700000000000,
  vote: { selectedOptions: [Buffer.from(poll.options[0].hash, 'base64')] },
}
await updateChatMessage(sessionId, { ...key, id: 'poll' }, { pollUpdates: [vote] }, 'own@lid')
assert.equal(messageDTO({ ...pollMessage, media: null }).poll?.options[0].votes, 1)
await updateChatMessage(
  sessionId,
  { ...key, id: 'poll' },
  { pollUpdates: [{ ...vote, senderTimestampMs: 1700000001000, vote: { selectedOptions: [] } }] },
  'own@lid',
)
assert.equal(messageDTO({ ...pollMessage, media: null }).poll?.options[0].votes, 0)
await updateChatMessage(sessionId, { ...key, id: 'poll' }, { pollUpdates: [vote] }, 'own@lid')
assert.equal(messageDTO({ ...pollMessage, media: null }).poll?.options[0].votes, 0)

const cases = [
  { message: { albumMessage: { expectedImageCount: 0, expectedVideoCount: 0 } } },
  { message: { groupInviteMessage: { groupName: 'Grupo', jpegThumbnail: jpeg } } },
  {
    messageStubType: proto.WebMessageInfo.StubType.DISAPPEARING_MODE,
    messageStubParameters: ['604800'],
  },
  {
    message: {
      placeholderMessage: {
        type: proto.Message.PlaceholderMessage.PlaceholderType.MASK_LINKED_DEVICES,
      },
    },
  },
  {
    message: {
      listResponseMessage: { title: 'Guia', singleSelectReply: { selectedRowId: 'guia' } },
    },
  },
]
for (const [index, content] of cases.entries()) {
  const saved = await storeChatMessage(
    sessionId,
    { key: { ...key, id: `case-${index}` }, ...content },
    'history',
  )
  assert.ok(saved)
  const dto = messageDTO({ ...saved, media: null })
  assert.ok(messageSchema.safeParse(dto).success)
  if (dto.groupInvite) assert.equal(dto.groupInvite.thumbnail?.base64, jpeg.toString('base64'))
  if (dto.selection) assert.equal(dto.selection.id, 'guia')
}

const location = await storeChatMessage(
  sessionId,
  {
    key: { ...key, id: 'location' },
    message: { liveLocationMessage: { degreesLatitude: 1, degreesLongitude: 2 } },
  },
  'history',
)
assert.ok(location)
await updateChatMessage(
  sessionId,
  { ...key, id: 'location' },
  { finalLiveLocation: { degreesLatitude: 0, degreesLongitude: 0 } },
)
assert.equal(messageDTO({ ...location, media: null }).location?.latitude, 0)
await updateChatMessage(sessionId, { ...key, id: 'poll' }, { deleted: true })
assert.equal(messageDTO({ ...pollMessage, media: null }).poll, null)
await updateChatMessage(sessionId, { ...key, id: 'poll' }, { pollUpdates: [vote] }, 'own@lid')
assert.equal(messageDTO({ ...pollMessage, media: null }).poll, null)
