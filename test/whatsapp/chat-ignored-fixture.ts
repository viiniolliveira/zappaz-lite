import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { WAMessageStubType, type WAProto } from 'baileys'

let transactions = 0
let created: { type: string; rawContent: unknown; content: unknown } | undefined
let foundId: string | undefined
let updated: { deletedAt?: Date; text?: string | null; content?: unknown } | undefined
let revokeLookup: { sessionId: string; messageId: string } | undefined
let mediaCreated: { kind: string; mimeType?: string } | undefined
let upserts = 0
const tx = {
  $executeRaw: async () => 0,
  waConversationDeletion: { findFirst: async () => null },
  waConversation: {
    upsert: async () => { upserts++; return { id: 'conversation', isGroup: true, lastActivityAt: null } },
    update: async () => ({}),
  },
  waMessage: {
    findFirst: async ({ where }: { where: { sessionId: string; messageId: string } }) => {
      revokeLookup = where
      return where.messageId === foundId ? { id: 'saved', conversationId: 'conversation', status: null, content: {} } : null
    },
    update: async ({ data }: { data: typeof updated }) => { updated = data },
    findUnique: async () => null,
    create: async ({ data }: { data: { type: string; rawContent: unknown; content: unknown; orderAt: Date } }) => {
      created = data
      return { ...data, id: 'saved', fromMe: false }
    },
  },
  waMessageMedia: { create: async ({ data }: { data: typeof mediaCreated }) => { mediaCreated = data } },
}
mock.module('@db/prisma', () => ({
  prisma: {
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
      transactions++
      return action(tx)
    },
  },
}))

const { storeChatMessage } = await import('../../server/src/lib/chat-store.ts')
const { onChatChange } = await import('../../server/src/lib/chat-events.ts')
let changes = 0
const unsubscribe = onChatChange(async () => {
  changes++
})
const ignored = [
  WAMessageStubType.E2E_ENCRYPTED,
  WAMessageStubType.E2E_ENCRYPTED_NOW,
  WAMessageStubType.BIZ_COEX_PRIVACY_TRANSITION,
  WAMessageStubType.BIZ_PRIVACY_MODE_INIT_FB,
  WAMessageStubType.BIZ_COEX_PRIVACY_INIT,
  WAMessageStubType.CHAT_PSA,
  WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB,
  WAMessageStubType.BIZ_BOT_1P_MESSAGING_ENABLED,
  WAMessageStubType.BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE,
]
try {
  for (const source of ['history', 'live'] as const) {
    for (const messageStubType of ignored) {
      const message: WAProto.IWebMessageInfo = {
        key: { id: `ignored-${messageStubType}`, remoteJid: '123@s.whatsapp.net', fromMe: false },
        messageStubType,
        message: { conversation: 'must not be persisted' },
      }
      assert.equal(await storeChatMessage('session', message, source), null)
    }
  }
  assert.equal(transactions, 0)
  assert.equal(changes, 0)

  for (const source of ['history', 'live'] as const) {
    for (const messageStubType of [224, 9999, null, undefined]) {
      const message: WAProto.IWebMessageInfo = {
        key: { id: `other-${source}-${messageStubType}`, remoteJid: '123@g.us', fromMe: false },
        messageStubType,
        messageStubParameters: ['original metadata'],
        messageTimestamp: 1700000000,
      }
      created = undefined
      updated = undefined
      revokeLookup = undefined
      foundId = message.key?.id ?? undefined
      assert.ok(await storeChatMessage('session', message, source))
      assert.equal(created?.type, messageStubType == null ? 'unavailable' : 'unknown')
      assert.deepEqual(created?.rawContent, JSON.parse(JSON.stringify(message)))
      assert.equal(updated, undefined)
      assert.equal(revokeLookup, undefined)
    }
  }
  assert.equal(transactions, 8)

  for (const parameters of [['original'], [], ['']] as string[][]) {
    foundId = parameters[0] || 'event-id'
    updated = undefined
    created = undefined
    const upsertsBefore = upserts
    assert.equal(await storeChatMessage('session', {
      key: { id: 'event-id', remoteJid: '123@g.us' },
      messageStubType: WAMessageStubType.REVOKE,
      messageStubParameters: parameters,
    }, 'live'), null)
    assert.equal(revokeLookup?.sessionId, 'session')
    assert.equal(revokeLookup?.messageId, foundId)
    assert.ok(updated?.deletedAt instanceof Date)
    assert.equal(updated?.text, null)
    assert.deepEqual(updated?.content, {})
    assert.equal(created, undefined)
    assert.equal(upserts, upsertsBefore)
  }
  foundId = undefined
  updated = undefined
  const upsertsBeforeMissing = upserts
  assert.equal(await storeChatMessage('session', {
    key: { id: 'missing', remoteJid: '123@g.us' }, messageStubType: WAMessageStubType.REVOKE,
  }, 'history'), null)
  assert.equal(updated, undefined)
  assert.equal(upserts, upsertsBeforeMissing)

  for (const kind of ['image', 'video'] as const) {
    const media = kind === 'image' ? { imageMessage: { mimetype: 'image/jpeg' } } : { videoMessage: { mimetype: 'video/mp4', staticUrl: 'https://example.invalid/video' } }
    const message: WAProto.IWebMessageInfo = {
      key: { id: `interactive-${kind}`, remoteJid: '123@g.us', fromMe: false },
      messageTimestamp: 1700000000,
      message: { interactiveMessage: { header: media, body: { text: 'Corpo' } } },
    }
    created = undefined
    mediaCreated = undefined
    assert.ok(await storeChatMessage('session', message, 'live'))
    assert.equal(created?.type, kind)
    assert.deepEqual(created?.rawContent, JSON.parse(JSON.stringify(message)))
    assert.deepEqual((created?.content as { interactive: unknown }).interactive, { title: null, footer: null, buttons: [] })
    assert.equal(mediaCreated?.kind, kind)
    assert.equal(mediaCreated?.mimeType, kind === 'image' ? 'image/jpeg' : 'video/mp4')
  }
} finally {
  unsubscribe()
}
