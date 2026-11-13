import { expect, test } from 'bun:test'
import { webhookMessage } from '../../server/src/lib/webhook-message.ts'
import { normalizeWhatsappMessage } from '../../server/src/lib/whatsapp-event-normalizer.ts'

test('webhook message exposes persisted IDs without changing quoted WhatsApp references', () => {
  const message = normalizeWhatsappMessage('session', {
    key: { id: 'WA123', remoteJid: '5511999@s.whatsapp.net' },
    message: { extendedTextMessage: { text: 'hello', contextInfo: { stanzaId: 'quoted' } } },
  })
  const payload = webhookMessage(message, { id: 'internal', messageId: 'WA123', conversationId: 'conversation' })
  expect(payload.id).toBe('internal')
  expect(payload.messageId).toBe('WA123')
  expect(payload.conversationId).toBe('conversation')
  expect(payload.replyTo?.id).toBe('quoted')
  expect(message.id).toBe('WA123')
})

test('events without a stored message expose null internal IDs, never WhatsApp ID fallbacks', () => {
  const message = normalizeWhatsappMessage('session', { key: { id: 'reaction' } })
  for (const record of [null, undefined]) {
    const payload = webhookMessage(message, record)
    expect(payload.id).toBeNull()
    expect(payload.conversationId).toBeNull()
    expect(payload.messageId).toBe('reaction')
  }
})
