import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
mock.module('@db/prisma', () => ({ prisma: {} }))
const { messageDTO } = await import('../../server/src/lib/chat-dto.ts')
const date = new Date('2026-01-01T00:00:00.000Z')
const interactive = { title: 'Título', footer: null, buttons: [{ kind: 'reply', text: 'Sim', id: 'yes', url: null }], payment: { referenceId: 'ref-sintetica', currency: 'BRL', totalAmount: { value: 1500, offset: 100 }, items: [{ name: 'Recarga', quantity: 1 }], pixCode: 'PIX-SINTETICO' } }
const record = {
  id: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222',
  conversationId: '33333333-3333-4333-8333-333333333333', messageId: 'message', clientRequestId: null,
  fromMe: false, senderJid: null, senderName: null, type: 'text', text: 'Corpo', hasLink: false, status: null,
  createdAt: date, updatedAt: date, sentAt: date, orderAt: date, editedAt: null, deletedAt: null,
  revision: 1, content: { interactive }, media: null,
}
assert.deepEqual(messageDTO(record).interactive, interactive)
const deleted = messageDTO({ ...record, deletedAt: date })
assert.equal(deleted.interactive, null)
assert.equal(deleted.text, null)
assert.equal(messageDTO({ ...record, content: {} }).interactive, null)
