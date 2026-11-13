import { describe, expect, test } from 'bun:test'
import { contactIdentifiers, messageContactIdentifiers } from '../../server/src/lib/chat-identity.ts'

const pn = '15551234567@s.whatsapp.net'
const lid = '987654321@lid'
const conflict = { status: 409, code: 'CONTACT_IDENTITY_CONFLICT' }

describe('WhatsApp contact identifiers', () => {
  test.each([
    [{ remoteJid: '15551234567:4@s.whatsapp.net', remoteJidAlt: '987654321:2@lid', addressingMode: 'pn' as const }, [pn, lid]],
    [{ remoteJid: '987654321:2@lid', remoteJidAlt: '15551234567:4@s.whatsapp.net', addressingMode: 'lid' as const }, [lid, pn]],
  ])('normalizes device JIDs in either addressing mode', (key, expected) => {
    expect(messageContactIdentifiers(key)).toEqual(expected)
    expect(contactIdentifiers(messageContactIdentifiers(key))).toEqual({ phoneNumber: '15551234567', lid })
  })

  test('a missing alternate leaves its identifier undefined rather than inventing one', () => {
    expect(contactIdentifiers(messageContactIdentifiers({ remoteJid: lid, addressingMode: 'lid' }))).toEqual({ phoneNumber: undefined, lid })
    expect(contactIdentifiers(messageContactIdentifiers({ remoteJid: pn, addressingMode: 'pn' }))).toEqual({ phoneNumber: '15551234567', lid: undefined })
  })

  test.each(['123@g.us', 'invalid', 'abc@lid', 'abc@s.whatsapp.net'])('ignores invalid alternate %s', (remoteJidAlt) => {
    expect(contactIdentifiers(messageContactIdentifiers({ remoteJid: pn, remoteJidAlt }))).toEqual({ phoneNumber: '15551234567', lid: undefined })
  })

  test('ignores group primary and participant aliases', () => {
    expect(messageContactIdentifiers({ remoteJid: '123@g.us', remoteJidAlt: pn, participant: lid, participantAlt: pn })).toEqual([])
    expect(contactIdentifiers(['123@g.us', null, undefined, 'abc@lid'])).toEqual({ phoneNumber: undefined, lid: undefined })
  })

  test('accepts duplicate normalized identifiers but rejects incompatible identifiers', () => {
    expect(contactIdentifiers([pn, '15551234567:2@s.whatsapp.net', lid, lid])).toEqual({ phoneNumber: '15551234567', lid })
    expect(() => contactIdentifiers([pn, '15550000000@s.whatsapp.net'])).toThrow(expect.objectContaining(conflict))
    expect(() => contactIdentifiers([lid, '111@lid'])).toThrow(expect.objectContaining(conflict))
    expect(() => contactIdentifiers(messageContactIdentifiers({ remoteJid: pn, remoteJidAlt: '15550000000@s.whatsapp.net' }))).toThrow(expect.objectContaining(conflict))
  })

  test.each([
    { remoteJid: pn, addressingMode: 'lid' as const },
    { remoteJid: lid, addressingMode: 'pn' as const },
  ])('rejects an addressing mode contradicting the primary JID', (key) => {
    expect(() => messageContactIdentifiers(key)).toThrow(expect.objectContaining(conflict))
  })
})
