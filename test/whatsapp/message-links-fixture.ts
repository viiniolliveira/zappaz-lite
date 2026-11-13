import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { WAProto } from 'baileys'

interface StoredMessage {
  id: string
  messageId: string
  conversationId: string
  hasLink: boolean
  deletedAt: Date | null
  text: string | null
  status: number | null
  content: unknown
  orderAt: Date
  fromMe: boolean
  revision: number
}
const messages = new Map<string, StoredMessage>()
const conversation = {
  id: 'conversation',
  isGroup: true,
  contactId: null,
  lastActivityAt: null,
  lastMessageId: null,
}
const tx = {
  $executeRaw: async () => 1,
  waConversationDeletion: { findFirst: async () => null },
  waConversation: {
    upsert: async () => conversation,
    update: async () => conversation,
  },
  waMessageMedia: { create: async () => ({}) },
  waMessage: {
    findUnique: async ({
      where,
    }: {
      where: { sessionId_conversationId_messageId: { messageId: string } }
    }) => messages.get(where.sessionId_conversationId_messageId.messageId) ?? null,
    findFirst: async ({ where }: { where: { messageId: string } }) =>
      messages.get(where.messageId) ?? null,
    create: async ({ data }: { data: StoredMessage }) => {
      const record = {
        hasLink: false,
        deletedAt: null,
        status: null,
        revision: 1,
        ...data,
        id: data.messageId,
      }
      messages.set(record.messageId, record)
      return record
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string }
      data: Omit<Partial<StoredMessage>, 'revision'> & { revision?: { increment: number } }
    }) => {
      const record = messages.get(where.id)
      assert.ok(record)
      const { revision, ...changes } = data
      Object.assign(record, changes)
      if (revision) record.revision += revision.increment
      return record
    },
  },
}
mock.module('@db/prisma', () => ({
  prisma: { $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx) },
}))
const { storeChatMessage, updateChatMessage } = await import('../../server/src/lib/chat-store.ts')
const key = (id: string, fromMe = false) => ({ id, remoteJid: 'links@g.us', fromMe })
async function save(
  id: string,
  message: WAProto.IMessage,
  source: 'live' | 'history' = 'live',
  fromMe = false,
) {
  const result = await storeChatMessage(
    'session',
    { key: key(id, fromMe), message, messageTimestamp: 1700000000 },
    source,
  )
  assert.ok(result)
  const record = messages.get(id)
  assert.ok(record)
  return record
}

for (const source of ['live', 'history'] as const) {
  for (const fromMe of [false, true]) {
    const prefix = `${source}-${fromMe}`
    assert.equal(
      (await save(`${prefix}-text`, { conversation: 'Acesse https://example.com' }, source, fromMe))
        .hasLink,
      true,
    )
    assert.equal(
      (
        await save(
          `${prefix}-caption`,
          {
            imageMessage: {
              mimetype: 'image/jpeg',
              caption: 'Veja https://example.com e http://example.org',
            },
          },
          source,
          fromMe,
        )
      ).hasLink,
      true,
    )
    assert.equal(
      (
        await save(
          `${prefix}-preview`,
          {
            extendedTextMessage: {
              text: 'https://example.com',
              matchedText: 'https://example.com',
              title: 'Preview',
            },
          },
          source,
          fromMe,
        )
      ).hasLink,
      true,
    )
    assert.equal(
      (
        await save(
          `${prefix}-preview-in-code`,
          {
            extendedTextMessage: {
              text: '`https://example.com`',
              matchedText: 'https://example.com',
              title: 'Preview',
            },
          },
          source,
          fromMe,
        )
      ).hasLink,
      true,
    )
    for (const [index, text] of [
      'sem link',
      '`https://example.com`',
      'https://user:pass@example.com',
      'javascript:alert(1)',
    ].entries()) {
      assert.equal(
        (await save(`${prefix}-false-${index}`, { conversation: text }, source, fromMe)).hasLink,
        false,
      )
    }
  }
}
const reply = await save('edit-reply', { extendedTextMessage: {
  text: 'Resposta original',
  contextInfo: { stanzaId: 'quoted-id', participant: '123@s.whatsapp.net', quotedMessage: { conversation: 'Texto citado' } },
} }, 'live', true)
const quote = (reply.content as { replyTo: unknown }).replyTo
assert.ok(quote)
const originalTime = reply.orderAt
const originalCount = messages.size
await updateChatMessage('session', key('edit-reply', true), { message: { extendedTextMessage: { text: 'Nova resposta https://example.com' } } })
assert.deepEqual((reply.content as { replyTo: unknown }).replyTo, quote)
assert.equal(reply.orderAt, originalTime)
assert.equal(messages.size, originalCount)
assert.equal(reply.text, 'Nova resposta https://example.com')
assert.equal(reply.hasLink, true)
await updateChatMessage('session', key('edit-reply', true), { message: { extendedTextMessage: { text: 'Editada novamente' } } })
assert.deepEqual((reply.content as { replyTo: unknown }).replyTo, quote)
assert.equal(reply.hasLink, false)

const original = await save('edit', { conversation: 'https://example.com' })
assert.equal(original.hasLink, true)
await updateChatMessage('session', key('edit'), { status: 3 })
assert.equal(original.hasLink, true)
await updateChatMessage('session', key('edit'), { message: { conversation: 'sem link' } })
assert.equal(original.hasLink, false)
await updateChatMessage('session', key('edit'), { status: 4 })
assert.equal(original.hasLink, false)
await storeChatMessage(
  'session',
  { key: key('edit'), message: { conversation: 'https://example.com' } },
  'history',
)
assert.equal(original.hasLink, false)
await updateChatMessage('session', key('edit'), {
  message: { conversation: '*https://example.org*' },
})
assert.equal(original.hasLink, true)
await updateChatMessage('session', key('edit'), { deleted: true })
assert.ok(original.deletedAt)
assert.equal(original.hasLink, false)
await updateChatMessage('session', key('edit'), {
  message: { conversation: 'https://example.com' },
})
await updateChatMessage('session', key('edit'), { status: 5 })
await storeChatMessage(
  'session',
  { key: key('edit'), message: { conversation: 'https://example.com' } },
  'history',
)
assert.ok(original.deletedAt)
assert.equal(original.hasLink, false)
assert.equal(original.text, null)

const location = await save('final-location', { conversation: 'https://example.com' })
assert.equal(location.hasLink, true)
await updateChatMessage('session', key('final-location'), {
  finalLiveLocation: { degreesLatitude: -23.55, degreesLongitude: -46.63 },
})
assert.equal(location.text, 'Localização em tempo real encerrada')
assert.equal(location.hasLink, false)
