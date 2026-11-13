import { describe, expect, test } from 'bun:test'
import {
  ContactParamsSchema,
  ContactQuerySchema,
  SaveContactSchema,
  UpdateContactSchema,
} from '../../server/src/modules/contacts/schema.ts'
import {
  MediaQuerySchema,
  MessageParamsSchema,
  MessageQuerySchema,
} from '../../server/src/modules/conversation-messages/schema.ts'
import {
  ConversationParamsSchema,
  ConversationReadStateSchema,
  CreateConversationSchema,
  ReadConversationSchema,
} from '../../server/src/modules/conversations/schema.ts'

const id = '00000000-0000-4000-8000-000000000001'

describe('chat request schemas', () => {
  test('accepts only an explicit boolean for local read state', () => {
    for (const read of [true, false])
      expect(ConversationReadStateSchema.parse({ read })).toEqual({ read })
    for (const input of [
      {},
      { read: 'true' },
      { read: 0 },
      { read: null },
      { read: false, whatsapp: true },
    ])
      expect(ConversationReadStateSchema.safeParse(input).success).toBe(false)
  })
  test('applies query defaults and coerces valid limits', () => {
    expect(ContactQuerySchema.parse({})).toEqual({ limit: 50, q: '' })
    expect(MessageQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 })
    expect(MediaQuerySchema.parse({ kind: 'image' })).toEqual({ limit: 50, kind: 'image' })
    expect(MediaQuerySchema.parse({ kind: 'gallery', limit: '4' })).toEqual({
      limit: 4,
      kind: 'gallery',
    })
  })
  test('rejects invalid limits, oversized cursors and conflicting boundaries', () => {
    for (const limit of ['0', '101', '1.5', 'invalid']) {
      expect(MessageQuerySchema.safeParse({ limit }).success).toBe(false)
      expect(ContactQuerySchema.safeParse({ limit }).success).toBe(false)
    }
    expect(ContactQuerySchema.safeParse({ q: 'x'.repeat(201) }).success).toBe(false)
    expect(MessageQuerySchema.safeParse({ before: 'x'.repeat(4097) }).success).toBe(false)
    expect(MessageQuerySchema.safeParse({ before: 'a', after: 'b' }).success).toBe(false)
    expect(MediaQuerySchema.safeParse({ kind: 'other' }).success).toBe(false)
  })
  test('validates identifiers and rejects unexpected fields in mutation bodies', () => {
    expect(ConversationParamsSchema.safeParse({ sessionId: 's', conversationId: id }).success).toBe(
      true,
    )
    expect(MessageParamsSchema.safeParse({ sessionId: '', conversationId: id }).success).toBe(false)
    expect(
      MessageParamsSchema.safeParse({ sessionId: 's', conversationId: id, messageRecordId: 'bad' })
        .success,
    ).toBe(false)
    expect(CreateConversationSchema.safeParse({ contactId: id, extra: true }).success).toBe(false)
    expect(ReadConversationSchema.safeParse({ lastReadMessageRecordId: 'bad' }).success).toBe(false)
    expect(ReadConversationSchema.safeParse({ lastReadMessageRecordId: id }).success).toBe(true)
  })
  test('opens by exactly one valid contact ID or normalized phone number', () => {
    expect(CreateConversationSchema.parse({ contactId: id })).toEqual({ contactId: id })
    expect(CreateConversationSchema.parse({ phoneNumber: '+55 (11) 99999-9999' })).toEqual({
      phoneNumber: '5511999999999',
    })
    for (const input of [
      {},
      { contactId: id, phoneNumber: '5511999999999' },
      { phoneNumber: '123456' },
      { phoneNumber: '01234567' },
      { phoneNumber: '1234567', extra: true },
      { contactId: 'bad' },
    ]) {
      expect(CreateConversationSchema.safeParse(input).success).toBe(false)
    }
  })
})

describe('agenda mutation schemas', () => {
  test('trims names and normalizes formatted international phone numbers', () => {
    expect(
      SaveContactSchema.parse({ name: '  Maria Silva  ', phoneNumber: '+55 (11) 99999-9999' }),
    ).toEqual({ name: 'Maria Silva', phoneNumber: '5511999999999' })
    expect(SaveContactSchema.parse({ name: 'A', phoneNumber: '1234567' }).phoneNumber).toBe(
      '1234567',
    )
    expect(
      SaveContactSchema.parse({ name: 'x'.repeat(200), phoneNumber: '123456789012345' }).name,
    ).toHaveLength(200)
    expect(UpdateContactSchema.parse({ name: '  Local  ' })).toEqual({ name: 'Local' })
  })

  test('rejects invalid names, numbers, identifiers and unexpected fields', () => {
    for (const name of ['', '   ', 'x'.repeat(201)]) {
      expect(SaveContactSchema.safeParse({ name, phoneNumber: '5511999999999' }).success).toBe(
        false,
      )
      expect(UpdateContactSchema.safeParse({ name }).success).toBe(false)
    }
    for (const phoneNumber of ['', '01234567', '123456', '1234567890123456', '12345abc67']) {
      expect(SaveContactSchema.safeParse({ name: 'A', phoneNumber }).success).toBe(false)
    }
    expect(
      SaveContactSchema.safeParse({ name: 'A', phoneNumber: '1234567', extra: true }).success,
    ).toBe(false)
    expect(UpdateContactSchema.safeParse({ name: 'A', extra: true }).success).toBe(false)
    expect(ContactParamsSchema.safeParse({ sessionId: 's', contactId: id }).success).toBe(true)
    expect(ContactParamsSchema.safeParse({ sessionId: 's', contactId: 'bad' }).success).toBe(false)
    expect(ContactParamsSchema.safeParse({ sessionId: '', contactId: id }).success).toBe(false)
  })

  test('accepts and trims optional email and annotations, including empty and null values', () => {
    expect(
      SaveContactSchema.parse({
        name: 'A',
        phoneNumber: '1234567',
        email: '  pessoa@example.com  ',
        annotations: '  Notas  ',
      }),
    ).toEqual({
      name: 'A',
      phoneNumber: '1234567',
      email: 'pessoa@example.com',
      annotations: 'Notas',
    })
    expect(UpdateContactSchema.parse({ name: 'A', email: '', annotations: null })).toEqual({
      name: 'A',
      email: '',
      annotations: null,
    })
    expect(
      UpdateContactSchema.safeParse({ name: 'A', annotations: 'x'.repeat(5000) }).success,
    ).toBe(true)
  })

  test('rejects invalid or oversized optional contact details', () => {
    for (const email of ['invalid', 'a'.repeat(245) + '@example.com']) {
      expect(
        SaveContactSchema.safeParse({ name: 'A', phoneNumber: '1234567', email }).success,
      ).toBe(false)
      expect(UpdateContactSchema.safeParse({ name: 'A', email }).success).toBe(false)
    }
    expect(
      UpdateContactSchema.safeParse({ name: 'A', annotations: 'x'.repeat(5001) }).success,
    ).toBe(false)
  })
})
