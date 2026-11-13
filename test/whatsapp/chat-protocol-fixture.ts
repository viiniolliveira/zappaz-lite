import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { proto, type WAProto } from 'baileys'

let transactions = 0
mock.module('@db/prisma', () => ({ prisma: {
  $transaction: () => {
    transactions++
    throw new Error('Control events must not access the database')
  },
} }))

const { storeChatMessage } = await import('../../server/src/lib/chat-store.ts')
const { onChatChange } = await import('../../server/src/lib/chat-events.ts')
let changes = 0
const unsubscribe = onChatChange(async () => { changes++ })

const message: WAProto.IWebMessageInfo = {
  key: {
    id: 'protocol-message', fromMe: false,
    remoteJid: '100@lid', remoteJidAlt: '111@s.whatsapp.net', addressingMode: 'lid',
  },
  message: {
    protocolMessage: {
      type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SYNC_RESPONSE,
      disappearingMode: { initiator: proto.DisappearingMode.Initiator.CHANGED_IN_CHAT },
      ephemeralExpiration: 86400,
      ephemeralSettingTimestamp: 1700000000,
    },
  },
  messageTimestamp: 1700000001,
}

try {
  for (const source of ['live', 'history'] as const) {
    assert.equal(await storeChatMessage('session', message, source), null)
    assert.equal(await storeChatMessage('session', { ...message, message: { ephemeralMessage: { message: message.message } } }, source), null)
    for (const type of [proto.Message.ProtocolMessage.Type.REVOKE, proto.Message.ProtocolMessage.Type.MESSAGE_EDIT]) {
      assert.equal(await storeChatMessage('session', { ...message, message: { protocolMessage: { type } } }, source), null)
    }
  }
  assert.equal(transactions, 0)
  assert.equal(changes, 0)
} finally {
  unsubscribe()
}
