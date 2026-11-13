import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import axios from 'axios'
import { receivedVcard } from './vcard-fixture.ts'

const logs: any[] = []
const saved: any[] = []
const history: any[] = []
mock.module('../../server/src/lib/chat-store.ts', () => ({
  updateContactAvatar: async () => {
    throw new Error('Unexpected contact avatar update in webhook fixture')
  },
  chatTransaction: async () => {
    throw new Error('Unexpected chat transaction in webhook fixture')
  },
  storeChatMessage: async (sessionId: string, message: any, source: string) => {
    const row = {
      id: `internal-${message.key.id}`,
      conversationId: 'conversation-1',
      messageId: message.key.id,
      sessionId,
      source,
    }
    saved.push(row)
    return row
  },
  storeContacts: async (_sessionId: string, contacts: unknown[]) => ({ processed: contacts.length, conflicts: 0 }),
  storeChatSummaries: async (_sessionId: string, chats: unknown[]) => ({ processed: chats.length, conflicts: 0 }),
  deleteChatMessages: async () => {},
  updateChatMessage: async () => {},
  storeChatReaction: async () => {},
  findLegacyMessage: async () => null,
}))
mock.module('@db/prisma', () => ({
  prisma: {
    waMessage: {
      create: async ({ data }: any) => {
        saved.push(data)
      },
      findUnique: async () => null,
    },
    waSendMessageHistory: {
      create: async ({ data }: any) => {
        history.push(data)
      },
    },
    webhookLog: {
      create: async ({ data }: any) => {
        logs.push(data)
        return { ...data, id: 'log' }
      },
    },
    globalWebhook: { findMany: async () => [] },
  },
}))
mock.module('@lib/webhook-log-publisher', () => ({
  publishWebhookLogCreated: async () => {},
}))

const { default: axiosInstance } = await import(
  '../../server/src/lib/axios-instance.ts'
)
const { WhatsappSession } = await import(
  '../../server/src/lib/whatsapp-session.ts'
)
const { whatsappService } = await import(
  '../../server/src/services/whatsapp.ts'
)
const service = whatsappService as any
await service.loadGlobalWebhooks()
const sent: any[] = []
let resolveGlobal!: () => void
const globalSent = new Promise<void>((resolve) => {
  resolveGlobal = resolve
})
let eventResolved: (() => void) | undefined
const adapter = async (config: any) => {
  sent.push({ url: config.url, data: JSON.parse(config.data), headers: new Headers(config.headers.toJSON()) })
  if (config.url === 'https://global.invalid') {
    resolveGlobal()
    eventResolved?.()
  }
  return { config, status: 200, statusText: 'OK', data: {}, headers: {} }
}
axios.defaults.adapter = adapter
axiosInstance.defaults.adapter = adapter
const session = new WhatsappSession(
  'session-1',
  false,
  {} as any,
  'Test',
  null,
) as any
session._enabled = true // Avoid creating a real WhatsApp client.
session.jid = 'self@lid'
const events = {
  'inbound-message.upsert': true,
  'outbound-message.upsert': true,
  'messages.send': true,
  'messages.update': true,
  'messages.reaction': true,
  'message-receipt.update': true,
}
session.webhooks = [
  {
    id: 'hook',
    enabled: true,
    url: 'https://session.invalid',
    events,
    headers: {},
    displayName: 'Hook',
  },
]
service.sessionMap.set(session.id, session)
service.globalWebhooks = [
  {
    id: 'global',
    enabled: true,
    url: 'https://global.invalid',
    events,
    headers: {},
  },
]
session.onEventForwarded = service.processSessionEvent
// Even a stored webhook explicitly requesting credentials must never receive them.
session.webhooks[0].events['creds.update'] = true
service.globalWebhooks[0].events['creds.update'] = true
let credentialsSaved = 0
session.authStateCacheManager = { saveCreds: async () => { credentialsSaved++ } }
await session.onCredsUpdate({ signedIdentityKey: { private: Buffer.from('synthetic-private-key') } })
assert.equal(credentialsSaved, 1)
assert.equal(sent.length, 0)
assert.equal(logs.length, 0)
await session.forwardEvent({ event: 'creds.update', payload: { private: 'synthetic' }, resend: true })
assert.equal(sent.length, 0)
assert.equal(logs.length, 0)
const jpeg = await (await import('sharp')).default({ create: { width: 13, height: 7, channels: 3, background: '#c30' } }).jpeg().toBuffer()
const incoming = {
  key: {
    id: 'msg',
    remoteJid: 'group@g.us',
    participant: 'alice@lid',
    fromMe: false,
  },
  messageTimestamp: 1700000000,
  message: {
    extendedTextMessage: {
      text: 'hello',
      contextInfo: {
        stanzaId: 'quoted',
        participant: 'bob@lid',
        quotedMessage: {
          imageMessage: {
            caption: 'photo',
            mimetype: 'image/jpeg',
            fileLength: 42,
            jpegThumbnail: jpeg,
            mediaKey: new Uint8Array([1]),
          },
        },
      },
    },
  },
}
await session.onMessagesUpsert({ messages: [incoming], type: 'notify' })
await globalSent
const expected = {
  message: {
    id: 'internal-msg',
    messageId: 'msg',
    conversationId: 'conversation-1',
    chatId: 'group@g.us',
    remoteJid: null,
    lid: null,
    fromMe: false,
    isGroup: true,
    sender: { id: 'alice@lid' },
    timestamp: '2023-11-14T22:13:20.000Z',
    type: 'text',
    text: 'hello',
    replyTo: {
      id: 'quoted',
      senderId: 'bob@lid',
      type: 'image',
      text: 'photo',
      media: { mimeType: 'image/jpeg', size: 42, thumbnail: { mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 } },
    },
  },
}
assert.equal(saved[0].id, 'internal-msg')
assert.equal(saved[0].messageId, 'msg')
assert.equal(saved[0].sessionId, 'session-1')
assert.equal(saved[0].source, 'live')
assert.deepEqual(
  sent.map((request) => request.url),
  ['https://session.invalid', 'https://global.invalid'],
)
for (const request of sent) {
  assert.equal(request.data.event, 'inbound-message.upsert')
  assert.deepEqual(request.data.payload, expected)
}
assert.equal(logs[0].messageId, 'msg')
assert.deepEqual(logs[0].payload, expected)

async function expectForwarded(
  event: string,
  payload: unknown,
  action: () => Promise<unknown>,
) {
  const offset = sent.length
  const done = new Promise<void>((resolve) => {
    eventResolved = resolve
  })
  await action()
  await done
  eventResolved = undefined
  const forwarded = sent.slice(offset)
  assert.deepEqual(
    forwarded.map((request) => request.url),
    ['https://session.invalid', 'https://global.invalid'],
  )
  for (const request of forwarded) {
    assert.equal(request.data.event, event)
    assert.deepEqual(request.data.payload, payload)
  }
  assert.deepEqual(logs.at(-1).payload, payload)
}

const interactiveKey = { id: 'interactive', remoteJid: '0@s.whatsapp.net', fromMe: false }
const interactiveBase = {
  id: 'internal-interactive', messageId: 'interactive', conversationId: 'conversation-1', chatId: '0@s.whatsapp.net', remoteJid: '0@s.whatsapp.net', lid: null,
  fromMe: false, isGroup: false, sender: { id: '0@s.whatsapp.net' }, timestamp: '2023-11-14T22:13:20.000Z',
}
await expectForwarded('inbound-message.upsert', { message: {
  ...interactiveBase, type: 'text', text: 'Sim', templateReply: { selectedId: 'yes', selectedIndex: 0 },
  replyTo: { id: 'original', senderId: 'bob@lid', type: 'image', text: 'Escolha',
    media: { mimeType: 'image/jpeg', thumbnail: { mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 } },
    interactive: { title: null, footer: null, buttons: [{ kind: 'reply', text: 'Sim', id: 'yes', url: null }] } },
} }, () => session.onMessagesUpsert({ type: 'notify', messages: [{ key: interactiveKey, messageTimestamp: 1700000000, message: {
  templateButtonReplyMessage: { selectedDisplayText: 'Sim', selectedId: 'yes', selectedIndex: 0, contextInfo: {
    stanzaId: 'original', participant: 'bob@lid', quotedMessage: { templateMessage: { hydratedTemplate: {
      hydratedContentText: 'Escolha', imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg },
      hydratedButtons: [{ quickReplyButton: { displayText: 'Sim', id: 'yes' } }],
    } } },
  } },
} }] }))
await expectForwarded('inbound-message.upsert', { message: {
  ...interactiveBase, type: 'text', text: 'Corpo', interactive: { title: 'Título', footer: 'Fim', buttons: [
    { kind: 'url', text: 'Abrir', id: null, url: 'https://example.invalid/' },
    { kind: 'reply', text: 'Sim', id: 'yes', url: null },
  ] },
} }, () => session.onMessagesUpsert({ type: 'notify', messages: [{ key: interactiveKey, messageTimestamp: 1700000000, message: {
  templateMessage: { hydratedFourRowTemplate: { hydratedTitleText: 'Título', hydratedContentText: 'Corpo', hydratedFooterText: 'Fim', hydratedButtons: [
    { urlButton: { displayText: 'Abrir', url: 'https://example.invalid/' } },
    { quickReplyButton: { displayText: 'Sim', id: 'yes' } },
  ] } },
} }] }))
await expectForwarded('inbound-message.upsert', { message: {
  ...interactiveBase, type: 'image', text: 'Legenda', media: { mimeType: 'image/jpeg',
    downloadPath: '/api/v1/session/session-1/message/interactive/media/base64',
    thumbnail: { mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 } },
  interactive: { title: 'Imagem', footer: null, buttons: [
    { kind: 'reply', text: 'Escolher', id: 'choice', url: null },
    { kind: 'unsupported', text: 'Ação não suportada', id: null, url: null },
  ] },
} }, () => session.onMessagesUpsert({ type: 'notify', messages: [{ key: interactiveKey, messageTimestamp: 1700000000, message: {
  interactiveMessage: { header: { title: 'Imagem', imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg } }, body: { text: 'Legenda' }, nativeFlowMessage: { buttons: [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Escolher', id: 'choice' }) },
    { name: 'cta_url', buttonParamsJson: '{' },
  ] } },
} }] }))

const privateIncoming = {
  key: {
    id: 'private',
    remoteJid: '5511999:2@s.whatsapp.net',
    remoteJidAlt: '12345:3@lid',
    addressingMode: 'pn',
    fromMe: false,
  },
  messageTimestamp: 1700000000,
  message: { conversation: 'private text' },
}
await expectForwarded(
  'inbound-message.upsert',
  {
    message: {
      id: 'internal-private',
      messageId: 'private',
      conversationId: 'conversation-1',
      chatId: '5511999:2@s.whatsapp.net',
      remoteJid: '5511999@s.whatsapp.net',
      lid: '12345@lid',
      fromMe: false,
      isGroup: false,
      sender: { id: '5511999:2@s.whatsapp.net' },
      timestamp: '2023-11-14T22:13:20.000Z',
      type: 'text',
      text: 'private text',
    },
  },
  () =>
    session.onMessagesUpsert({ messages: [privateIncoming], type: 'notify' }),
)

const outgoing = {
  key: {
    id: 'outgoing',
    remoteJid: '12345:3@lid',
    remoteJidAlt: '5511999:2@s.whatsapp.net',
    addressingMode: 'lid',
    fromMe: true,
  },
  messageTimestamp: 1700000001,
  message: { conversation: 'sent text' },
}
const outboundPayload = {
  message: {
    id: 'internal-outgoing',
    messageId: 'outgoing',
    conversationId: 'conversation-1',
    chatId: '12345:3@lid',
    remoteJid: '5511999@s.whatsapp.net',
    lid: '12345@lid',
    fromMe: true,
    isGroup: false,
    sender: { id: 'self@lid' },
    timestamp: '2023-11-14T22:13:21.000Z',
    type: 'text',
    text: 'sent text',
  },
}
await expectForwarded('outbound-message.upsert', outboundPayload, () =>
  session.onMessagesUpsert({ messages: [outgoing], type: 'notify' }),
)
assert.equal(logs.at(-1).messageId, 'outgoing')

const sendCalls: unknown[] = []
session.client = {
  sendMessage: async (...args: unknown[]) => {
    sendCalls.push(args)
    return outgoing
  },
}
await expectForwarded('messages.send', outboundPayload, async () => {
  assert.deepEqual(
    await session.sendMessage('bob@lid', { text: 'sent text' }, 'text', {
      delay: 0,
    }),
    outgoing,
  )
})
assert.deepEqual(sendCalls, [
  ['bob@lid', { text: 'sent text', linkPreview: null }, { quoted: undefined }],
])
assert.deepEqual(history, [
  { recipientJid: 'bob@lid', sessionId: 'session-1', type: 'text' },
])
assert.equal(logs.at(-1).messageId, 'outgoing')

// An absent result or a failed send must not publish a messages.send event.
const forwardEvent = session.forwardEvent
const unexpectedEvents: unknown[] = []
session.forwardEvent = (event: unknown) => { unexpectedEvents.push(event) }
session.client.sendMessage = async () => undefined
assert.equal(await session.sendMessage('bob@lid', { text: 'not sent' }, 'text', {}), undefined)
const sendError = new Error('send failed')
session.client.sendMessage = async () => { throw sendError }
await assert.rejects(() => session.sendMessage('bob@lid', { text: 'failed' }, 'text', {}), sendError)
assert.deepEqual(unexpectedEvents, [])
session.forwardEvent = forwardEvent

const reference = {
  id: 'msg',
  chatId: 'group@g.us',
  remoteJid: null,
  lid: null,
  fromMe: false,
}
await expectForwarded(
  'messages.update',
  { messages: [{ ...reference, status: 'read' }] },
  () =>
    session.onMessagesUpdate([{ key: incoming.key, update: { status: 4 } }]),
)
await expectForwarded(
  'messages.reaction',
  {
    reactions: [
      {
        ...reference,
        sender: { id: 'alice@lid', fromMe: false },
        emoji: '',
        timestamp: '2023-11-14T22:13:20.123Z',
      },
    ],
  },
  () =>
    session.onMessagesReaction([
      {
        key: incoming.key,
        reaction: {
          key: { participant: 'alice@lid' },
          text: '',
          senderTimestampMs: 1700000000123,
        },
      },
    ]),
)
await expectForwarded(
  'message-receipt.update',
  {
    receipts: [
      {
        ...reference,
        recipientId: 'bob@lid',
        deliveredAt: '2023-11-14T22:13:20.000Z',
        readAt: null,
        playedAt: null,
      },
    ],
  },
  () =>
    session.onMessageReceiptUpdate([
      {
        key: incoming.key,
        receipt: { userJid: 'bob@lid', receiptTimestamp: 1700000000 },
      },
    ]),
)

// Detection is pure: it must unwrap media without downloading or accessing a socket.
assert.ok(
  session.isMediaMessage({
    message: { ephemeralMessage: { message: { imageMessage: {} } } },
  }),
)
assert.ok(
  session.isMediaMessage({
    message: {
      documentWithCaptionMessage: { message: { documentMessage: {} } },
    },
  }),
)
assert.ok(!session.isMediaMessage({ message: { conversation: 'text' } }))

let mediaFetches = 0
session.getMessageMediaById = async () => {
  mediaFetches++
  return 'fresh-base64'
}
const retry = {
  url: 'https://retry.invalid',
  parentLogId: 'parent',
  event: 'inbound-message.upsert',
  messageId: 'msg',
  webhookId: 'hook',
}
await session.resendWebhookEvent({ ...retry, payload: logs[0].payload })
assert.equal(mediaFetches, 0)
assert.deepEqual(sent.at(-1).data.payload, expected)
assert.equal(logs.at(-1).messageId, 'msg')
assert.equal(logs.at(-1).parentLogId, 'parent')
assert.deepEqual(logs.at(-1).payload, expected)
await session.resendWebhookEvent({
  ...retry,
  messageId: 'outgoing',
  payload: outboundPayload,
})
assert.deepEqual(sent.at(-1).data.payload, outboundPayload)
assert.deepEqual(logs.at(-1).payload, outboundPayload)
assert.equal(logs.at(-1).parentLogId, 'parent')
const legacy = { data: { key: { id: 'legacy-id' } }, base64Media: null }
await session.resendWebhookEvent({
  ...retry,
  messageId: 'legacy-id',
  payload: legacy,
})
assert.equal(mediaFetches, 1)
assert.deepEqual(sent.at(-1).data.payload, {
  ...legacy,
  base64Media: 'fresh-base64',
})
assert.equal(logs.at(-1).messageId, 'legacy-id')
assert.equal(logs.at(-1).payload.base64Media, null)
assert.equal(legacy.base64Media, null)

// Deliveries use each webhook's current secret, independently of saved payloads.
session.webhooks[0].headers['X-Zappaz-Webhook-Secret'] = 'session-secret'
service.globalWebhooks[0].headers['X-Zappaz-Webhook-Secret'] = 'global-secret'
await session.forwardEvent({ event: 'messages.update', payload: { marker: 'secret-delivery' } })
await service.forwardToGlobalWebhooks({ id: session.id, jid: session.jid, status: session.status }, 'messages.update', {})
assert.equal(sent.filter((item) => item.url === 'https://session.invalid').at(-1).headers.get('X-Zappaz-Webhook-Secret'), 'session-secret')
assert.equal(sent.filter((item) => item.url === 'https://global.invalid').at(-1).headers.get('X-Zappaz-Webhook-Secret'), 'global-secret')
session.webhooks[0].headers['X-Zappaz-Webhook-Secret'] = 'rotated-secret'
await session.resendWebhookEvent({ ...retry, payload: logs[0].payload })
assert.equal(sent.at(-1).headers.get('X-Zappaz-Webhook-Secret'), 'rotated-secret')
delete session.webhooks[0].headers['X-Zappaz-Webhook-Secret']
delete service.globalWebhooks[0].headers['X-Zappaz-Webhook-Secret']
await session.resendWebhookEvent({ ...retry, payload: logs[0].payload })
assert.equal(sent.at(-1).headers.has('X-Zappaz-Webhook-Secret'), false)
await service.forwardToGlobalWebhooks({ id: session.id, jid: session.jid, status: session.status }, 'messages.update', {})
assert.equal(sent.at(-1).headers.has('X-Zappaz-Webhook-Secret'), false)

const sharedContact = {
  name: 'Maria',
  vcard: receivedVcard,
  parsed: {
    name: 'Maria', firstName: 'Maria', lastName: null,
    phones: [{ number: '+55 11 90000-0000', waid: '5511900000000', types: ['CELL', 'VOICE'] }],
    emails: [], organization: null,
  },
}
const sharedMessage = {
  ...privateIncoming,
  key: { ...privateIncoming.key, id: 'shared-contact' },
  message: { contactMessage: { displayName: 'Maria', vcard: receivedVcard } },
}
const sharedPayload = { message: {
  id: 'internal-shared-contact', messageId: 'shared-contact', conversationId: 'conversation-1', chatId: privateIncoming.key.remoteJid,
  remoteJid: '5511999@s.whatsapp.net', lid: '12345@lid', fromMe: false,
  isGroup: false, sender: { id: privateIncoming.key.remoteJid }, timestamp: '2023-11-14T22:13:20.000Z',
  type: 'contact', contacts: [sharedContact],
} }
await expectForwarded('inbound-message.upsert', sharedPayload, () => session.onMessagesUpsert({ messages: [sharedMessage], type: 'notify' }))
const { contacts: _sharedContacts, ...sharedReference } = sharedPayload.message
await expectForwarded('inbound-message.upsert', { message: { ...sharedReference, type: 'text', text: 'Contato citado', replyTo: { id: 'shared-contact', type: 'contact', contacts: [sharedContact] } } }, async () => {
  await session.onMessagesUpsert({ messages: [{ ...sharedMessage, message: { extendedTextMessage: { text: 'Contato citado', contextInfo: { stanzaId: 'shared-contact', quotedMessage: sharedMessage.message } } } }], type: 'notify' })
})
const sharedOutgoing = { ...sharedMessage, key: { ...sharedMessage.key, fromMe: true } }
const sharedOutgoingPayload = { message: { ...sharedPayload.message, fromMe: true, sender: { id: session.jid } } }
await expectForwarded('outbound-message.upsert', sharedOutgoingPayload, () => session.onMessagesUpsert({ messages: [sharedOutgoing], type: 'notify' }))
session.client.sendMessage = async () => sharedOutgoing
await expectForwarded('messages.send', sharedOutgoingPayload, () => session.sendMessage(privateIncoming.key.remoteJid, { contacts: { displayName: 'Maria', contacts: [sharedMessage.message.contactMessage] } }, 'contact', {}))
