import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

let transactions = 0
const reachedPersistence = new Error('Reached private conversation persistence')
mock.module('@db/prisma', () => ({ prisma: {
  $transaction: async () => { transactions++; throw reachedPersistence },
} }))

const { storeChatMessage, storeChatSummaries, storeContacts } = await import('../../server/src/lib/chat-store.ts')

for (const source of ['live', 'history'] as const) {
  for (const fromMe of [false, true]) {
    const result = await storeChatMessage('session', {
      key: { id: 'status-post', remoteJid: 'status@broadcast', participant: '5511999999999@s.whatsapp.net', fromMe },
      message: { imageMessage: { caption: 'Status publication' } },
    }, source)
    assert.equal(result, null)
  }
}
await storeChatSummaries('session', [{ id: 'status@broadcast' }])
await storeContacts('session', [{ id: 'status@broadcast' }])
assert.equal(transactions, 0)

for (const remoteJid of ['5511999999999@s.whatsapp.net', '123456789@lid']) {
  await assert.rejects(storeChatMessage('session', {
    key: { id: 'private-status-reply', remoteJid, fromMe: false },
    message: { extendedTextMessage: {
      text: 'Resposta privada ao status',
      contextInfo: {
        remoteJid: 'status@broadcast',
        stanzaId: 'status-post',
        participant: '5511888888888@s.whatsapp.net',
        quotedMessage: { conversation: 'Meu status' },
      },
    } },
  }), error => error === reachedPersistence)
}
assert.equal(transactions, 2)
