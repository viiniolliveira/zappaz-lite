import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageContacts from '../../src/components/chat/messages/message-contacts.tsx'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import MessageReply from '../../src/components/chat/messages/message-reply.tsx'
import { replySchema, sharedContactSchema } from '../../src/lib/chat/schemas.ts'
import { normalizeVcardContact } from '../../server/src/lib/vcard.ts'
import { sentVcard, receivedVcard } from '../whatsapp/vcard-fixture.ts'
import { mockMessage, mockConversations } from './mock-data.ts'
import { sharedContactPhone } from '../../src/lib/chat/shared-contact.ts'

const contacts = [normalizeVcardContact({ vcard: sentVcard }), normalizeVcardContact({ displayName: 'Maria', vcard: receivedVcard })].map(contact => sharedContactSchema.parse(contact))

describe('shared contact cards', () => {
  test('chooses a valid waid first, falls back to the phone and rejects invalid values', () => {
    const make = (phones: { number: string; waid: string | null }[]) => ({ ...contacts[0], parsed: { ...contacts[0].parsed!, phones } })
    expect(sharedContactPhone(make([{ number: '+55 (11) 90000-0000', waid: '5511999999999' }]))).toBe('5511999999999')
    expect(sharedContactPhone(make([{ number: '+55 (11) 90000-0000', waid: 'bad@lid' }]))).toBe('5511900000000')
    expect(sharedContactPhone(make([{ number: '01234567', waid: '123' }, { number: '1234567', waid: null }]))).toBe('1234567')
    expect(sharedContactPhone(make([{ number: '1234567890123456', waid: 'abc' }]))).toBeNull()
    expect(sharedContactPhone({ name: 'X', vcard: null, parsed: null })).toBeNull()
  })
  test('accepts the original and extracted data in the frontend contract', () => {
    expect(contacts[0].vcard).toBe(sentVcard)
    expect(contacts[0].parsed?.phones[0]?.waid).toBe('5511999999999')
    expect(contacts[1].parsed?.firstName).toBe('Maria')
  })
  test('requires parsed data or an explicit null and the contacts list in replies', () => {
    expect(sharedContactSchema.safeParse({ name: 'Contato', vcard: sentVcard }).success).toBe(false)
    expect(sharedContactSchema.safeParse({ name: 'Contato', vcard: 'broken', parsed: null }).success).toBe(true)
    const reply = { messageRecordId: null, messageId: 'quoted', senderJid: null, type: 'text', text: 'Mensagem', media: null }
    expect(replySchema.safeParse(reply).success).toBe(false)
    expect(replySchema.safeParse({ ...reply, contacts: [] }).success).toBe(true)
  })
  test('renders multiple extracted cards with disabled actions when no session is selected', () => {
    const html = renderToStaticMarkup(createElement(MessageContacts, { contacts }))
    expect(html).toContain('Contato de teste Zappaz')
    expect(html).toContain('Maria')
    expect(html).toContain('+55 11 90000-0000')
    expect(html).toContain('+5511999999999')
    expect(html).not.toContain('BEGIN:VCARD')
    expect(html).not.toContain('undefined')
    expect(html.match(/disabled=""/g)).toHaveLength(4)
    expect(html.match(/Enviar mensagem/g)).toHaveLength(2)
    expect(html.match(/Salvar contato/g)).toHaveLength(2)
  })
  test('renders email and organization as text and explains malformed cards', () => {
    const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:<script>alert(1)</script>\nEMAIL:person@example.com\nORG:Empresa\nEND:VCARD'
    const contact = sharedContactSchema.parse(normalizeVcardContact({ vcard }))
    const html = renderToStaticMarkup(createElement(MessageContacts, { contacts: [contact, { name: 'Inválido', vcard: 'broken', parsed: null }] }))
    expect(html).toContain('person@example.com')
    expect(html).toContain('Empresa')
    expect(html).toContain('Não foi possível interpretar o vCard.')
    expect(html).not.toContain('<script>')
  })
  test('shows extracted data in the message body and contact names in quotes', () => {
    const message = mockMessage(99, mockConversations[0].id, { type: 'contact', text: null, contacts })
    expect(renderToStaticMarkup(createElement(MessageBubble, { message }))).toContain('+55 11 90000-0000')
    const reply = { messageRecordId: null, messageId: 'shared-contact', senderJid: null, type: 'contact' as const, text: null, media: null, contacts }
    expect(renderToStaticMarkup(createElement(MessageReply, { reply }))).toContain('Contato de teste Zappaz, Maria')
    const deleted = renderToStaticMarkup(createElement(MessageReply, { reply, quotedMessage: { ...message, deletedAt: message.createdAt } }))
    expect(deleted).toContain('Mensagem removida')
    expect(deleted).not.toContain('Maria')
  })
})
