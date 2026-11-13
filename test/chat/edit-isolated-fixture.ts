import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { WAProto } from 'baileys'

const id = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'
const date = new Date('2026-11-11T10:00:00Z')
const quote = {
  id: 'quoted-wa',
  text: 'Texto citado',
  type: 'text',
  senderId: '123@s.whatsapp.net',
}
const row = {
  id,
  sessionId: 's',
  conversationId,
  messageId: 'wa-original',
  clientRequestId: null,
  fromMe: true,
  senderJid: null,
  senderName: null,
  type: 'text',
  text: 'Original',
  hasLink: false,
  status: 4,
  sentAt: date,
  orderAt: date,
  createdAt: date,
  updatedAt: date,
  editedAt: null as Date | null,
  deletedAt: null as Date | null,
  revision: 1,
  content: { replyTo: quote, interactive: null as unknown },
  media: null,
  conversation: { jid: '123@s.whatsapp.net' },
}
let connected = true,
  enabled = true,
  success = true,
  ambiguous = false,
  throws = false
const sends: unknown[][] = []
let updates = 0
mock.module('../../server/src/db/prisma.ts', () => ({
  prisma: {
    waMessage: {
      findFirst: async ({
        where,
      }: {
        where: { sessionId: string; conversationId: string; id: string }
      }) =>
        where.sessionId === row.sessionId &&
        where.conversationId === row.conversationId &&
        where.id === row.id
          ? row
          : null,
    },
  },
}))
mock.module('../../server/src/lib/chat-media.ts', () => ({ retrieveChatMedia: async () => null }))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  chatTransaction: async () => {},
  privateJid: () => true,
  findLegacyMessage: async (session: string, messageId: string) => {
    if (ambiguous) {
      const { AppError } = await import('../../server/src/common/errors/app-error.ts')
      throw new AppError({
        status: 409,
        code: 'AMBIGUOUS_MESSAGE_ID',
        message: 'Specify the conversation',
      })
    }
    return session === row.sessionId && messageId === row.messageId ? row : null
  },
  updateChatMessage: async (
    _session: string,
    key: unknown,
    { message }: { message: WAProto.IMessage },
  ) => {
    assert.deepEqual(key, { id: row.messageId, remoteJid: row.conversation.jid, fromMe: true })
    updates++
    row.text = message.extendedTextMessage?.text ?? ''
    row.editedAt = new Date()
    row.revision++
  },
}))
mock.module('../../server/src/services/whatsapp.ts', () => ({
  whatsappService: {
    isSessionEnabled: () => enabled,
    isSessionConnected: () => connected,
    editTextMessage: async (...args: unknown[]) => {
      sends.push(args)
      if (throws) throw new Error('Socket disconnected during edit')
      return success
        ? {
            key: { id: 'edit-envelope' },
            message: {
              protocolMessage: { editedMessage: { extendedTextMessage: { text: args[2] } } },
            },
          }
        : null
    },
  },
}))
const pass = async (_c: unknown, next: () => Promise<void>) => next()
mock.module('../../server/src/middleware/auth.ts', () => ({
  requireSession: pass,
  requireSessionAuth: pass,
}))
mock.module('../../server/src/middleware/rate-limiter.ts', () => ({ rateLimiter: pass }))
mock.module('../../server/src/middleware/session.ts', () => ({
  requireEnabledSession: pass,
  requireConnectedSession: pass,
}))
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', (await import('../../server/src/modules/conversation-messages/route.ts')).default)
app.route('/', (await import('../../server/src/modules/whatsapp-messages/route.ts')).default)
const api = '/api/v1/session/s/message/wa-original'
const chat = `/api/v1/session/s/conversations/${conversationId}/messages/${id}`
const patch = (path: string, body: unknown) =>
  app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
for (const path of [api, chat]) {
  for (const body of [
    {},
    { text: '' },
    { text: ' \n ' },
    { text: 'x'.repeat(65537) },
    { text: 'Ok', extra: true },
  ]) {
    assert.equal((await patch(path, body)).status, 400)
  }
  assert.equal(sends.length, 0)
}
for (const path of [
  api.replace('/s/', '/other/'),
  chat.replace('/s/', '/other/'),
  chat.replace(conversationId, id),
  api.replace('wa-original', id),
  chat.replace(`messages/${id}`, `messages/${conversationId}`),
]) {
  assert.equal((await patch(path, { text: 'Changed' })).status, 404)
}
for (const path of [api, chat]) {
  row.fromMe = false
  assert.equal((await patch(path, { text: 'Changed' })).status, 403)
  row.fromMe = true
  for (const type of ['image', 'video', 'document', 'audio', 'sticker', 'unknown']) {
    row.type = type
    assert.equal((await patch(path, { text: 'Changed' })).status, 409)
  }
  row.type = 'text'
  row.content.interactive = { title: null, footer: null, buttons: [] }
  assert.equal((await patch(path, { text: 'Changed' })).status, 409)
  row.content.interactive = null
  row.deletedAt = date
  assert.equal((await patch(path, { text: 'Changed' })).status, 409)
  row.deletedAt = null
  enabled = false
  assert.equal((await patch(path, { text: 'Changed' })).status, 409)
  enabled = true
  connected = false
  assert.equal((await patch(path, { text: 'Changed' })).status, 409)
  connected = true
}
assert.equal(sends.length, 0)
ambiguous = true
assert.equal((await patch(api, { text: 'Changed' })).status, 409)
ambiguous = false
success = false
assert.equal((await patch(api, { text: 'Changed' })).status, 502)
assert.equal(updates, 0)
assert.equal(row.text, 'Original')
throws = true
assert.equal((await patch(chat, { text: 'Changed' })).status, 502)
assert.equal(updates, 0)
assert.equal(row.text, 'Original')
throws = false
success = true
for (const [path, text] of [
  [api, '  Editada pela API\ncom assinatura manual  '],
  [chat, 'Resposta editada pelo chat'],
] as const) {
  const response = await patch(path, { text })
  assert.equal(response.status, 200)
  const { data } = (await response.json()) as {
    data: {
      id: string
      messageId: string
      text: string
      editedAt: string
      orderAt: string
      status: string
      replyTo: { messageId: string; text: string }
    }
  }
  assert.equal(data.id, id)
  assert.equal(data.messageId, 'wa-original')
  assert.equal(data.text, text)
  assert.ok(data.editedAt)
  assert.equal(data.orderAt, date.toISOString())
  assert.equal(data.status, 'read')
  assert.equal(data.replyTo.messageId, quote.id)
  assert.equal(data.replyTo.text, quote.text)
  assert.deepEqual(sends.at(-1), [
    's',
    { id: 'wa-original', remoteJid: '123@s.whatsapp.net', fromMe: true },
    text,
  ])
}
assert.equal(updates, 2)
const sentCount = sends.length
assert.equal((await patch(api, { text: row.text })).status, 200)
assert.equal(sends.length, sentCount)
assert.equal(updates, 2)
