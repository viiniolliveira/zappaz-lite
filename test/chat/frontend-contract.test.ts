import { MessageSchema } from '../../server/src/lib/chat-contract.ts'
import { describe, expect, test } from 'bun:test'
import { conversationSchema, messagePageSchema, messageSchema, subscribeAckSchema } from '../../src/lib/chat/schemas.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'
import { contactInitials, messagePreview } from '../../src/lib/chat/types.ts'

const conversationId = '22222222-2222-4222-8222-222222222222'
const timestamp = '2026-10-31T12:00:00.000Z'

describe('chat frontend DTO contract', () => {
  test('accepts nullable fields, equal timestamps and distinct internal and WhatsApp IDs', () => {
    const message = mockMessage(1, conversationId, { sentAt: null, status: null, text: null, type: 'unknown' })
    const parsed = messageSchema.parse({ ...message, futureField: 'ignored' })
    expect(parsed).toEqual(message)
    expect(parsed.id).not.toBe(parsed.messageId)
    expect(parsed.orderAt).toBe(parsed.createdAt)
    expect(parsed.createdAt).toBe(parsed.updatedAt)
    expect(parsed.sentAt).toBeNull()
    expect(parsed.status).toBeNull()
  })

  test('accepts a reply without a local message record', () => {
    const replyTo = { messageRecordId: null, messageId: 'WA-not-in-history', senderJid: null, type: 'text' as const, text: null, contacts: [], media: null }
    expect(messageSchema.parse({ ...mockMessage(2, conversationId), replyTo }).replyTo).toEqual(replyTo)
  })

  test('rejects groups, invalid IDs, invalid timestamps and unknown message types', () => {
    const conversation = mockConversations[0]
    const message = mockMessage(3, conversationId)
    expect(conversationSchema.safeParse({ ...conversation, isGroup: true }).success).toBe(false)
    expect(messageSchema.safeParse({ ...message, id: 'WA-id' }).success).toBe(false)
    expect(messageSchema.safeParse({ ...message, orderAt: 'not-a-date' }).success).toBe(false)
    expect(messageSchema.safeParse({ ...message, type: 'future-type' }).success).toBe(false)
  })

  test('accepts empty pages and both subscription acknowledgement variants', () => {
    expect(messagePageSchema.parse({ status: 'success', data: [], page: { nextCursor: null, hasMore: false }, boundaries: { first: null, last: null } }).data).toEqual([])
    expect(subscribeAckSchema.parse({ ok: true, data: { sessionId: mockSessionId, subscribed: true } }).ok).toBe(true)
    expect(subscribeAckSchema.parse({ ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } }).ok).toBe(false)
    expect(subscribeAckSchema.safeParse({ ok: true, error: { code: 'x', message: 'x' } }).success).toBe(false)
  })
})

describe('chat demo data and presentation helpers', () => {
  test('all demo conversations and messages satisfy DTOs and retain their scope', () => {
    expect(mockConversations.length).toBeGreaterThan(0)
    for (const conversation of mockConversations) {
      expect(conversationSchema.safeParse(conversation).success).toBe(true)
      expect(conversation.isGroup).toBe(false)
      for (const message of conversation.messages) {
        expect(messageSchema.safeParse(message).success).toBe(true)
        expect(message.conversationId).toBe(conversation.id)
        expect(message.sessionId).toBe(conversation.sessionId)
        expect(message.id).not.toBe(message.messageId)
      }
    }
  })

  test('does not derive a phone number from an @lid demo contact', () => {
    const conversation = mockConversations.find(item => item.jid.endsWith('@lid'))
    expect(conversation).toBeDefined()
    expect(conversation?.contact?.phoneNumber).toBeNull()
  })

  test('provides readable initials, including whitespace and an empty name', () => {
    expect(contactInitials('  maria   da Silva ')).toBe('MD')
    expect(contactInitials('joão')).toBe('J')
    expect(contactInitials('  ')).toBe('?')
  })

  test('previews text, unsupported content, absent messages and tombstones', () => {
    const message = mockMessage(4, conversationId, { text: 'Conteúdo privado' })
    expect(messagePreview(null)).toBe('Nenhuma mensagem ainda')
    expect(messagePreview(message)).toBe('Conteúdo privado')
    expect(messagePreview({ ...message, type: 'unknown', text: null })).toBe('Conteúdo não suportado')
    expect(messagePreview({ ...message, deletedAt: timestamp })).toBe('Mensagem removida')
  })
})

test('requires the nullable interactive field rather than defaulting missing fields', () => {
  const message = mockMessage(88, conversationId)
  const { interactive: _, ...withoutInteractive } = message
  expect(messageSchema.safeParse(withoutInteractive).success).toBe(false)
  expect(messageSchema.parse({ ...message, interactive: null }).interactive).toBeNull()
})

test('requires the current rich-content fields without accepting older DTOs', () => {
  const message = mockMessage(89, conversationId)
  for (const field of ['poll', 'album', 'groupInvite', 'system', 'unavailable', 'selection'] as const) {
    const incomplete: Record<string, unknown> = { ...message }
    delete incomplete[field]
    expect(messageSchema.safeParse(incomplete).success).toBe(false)
  }
})

test('requires a nullable ISO avatar check timestamp on nested contacts', () => {
  const conversation = mockConversations[0]
  if (!conversation?.contact) throw new Error('Expected a conversation with a contact')
  const contact = conversation.contact
  const { avatarCheckedAt: _, ...missing } = contact
  expect(conversationSchema.safeParse({ ...conversation, contact: missing }).success).toBe(false)
  expect(conversationSchema.safeParse({ ...conversation, contact: { ...contact, avatarCheckedAt: 'invalid' } }).success).toBe(false)
  expect(conversationSchema.parse({ ...conversation, contact: { ...contact, avatarCheckedAt: null } }).contact?.avatarCheckedAt).toBeNull()
  expect(conversationSchema.parse({ ...conversation, contact: { ...contact, avatarCheckedAt: timestamp } }).contact?.avatarCheckedAt).toBe(timestamp)
})


test('requires a boolean hasLink in both message contracts without a default', () => {
  const message = mockMessage(90, conversationId)
  for (const schema of [messageSchema, MessageSchema]) {
    for (const value of [true, false]) {
      expect(schema.parse({ ...message, hasLink: value }).hasLink).toBe(value)
    }
    const missing: Record<string, unknown> = { ...message }
    delete missing.hasLink
    expect(schema.safeParse(missing).success).toBe(false)
    for (const value of [null, 'true', 1]) {
      expect(schema.safeParse({ ...message, hasLink: value }).success).toBe(false)
    }
  }
})
