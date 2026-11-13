import { describe, expect, test } from 'bun:test'
import { BadRequestError } from '../../server/src/common/errors/bad-request-error.ts'
import { createVcard, normalizeVcardContact, parseVcard } from '../../server/src/lib/vcard.ts'
import { normalizeWhatsappMessage } from '../../server/src/lib/whatsapp-event-normalizer.ts'
import { sentVcard, receivedVcard } from './vcard-fixture.ts'

describe('createVcard', () => {
  const contact = {
    firstName: 'Ana Maria',
    lastName: 'Silva Santos',
    phoneNumber: '5511999999999',
    wuid: '5511999999999@s.whatsapp.net',
  }

  test('generates a Baileys-style vCard and falls back to the full name', () => {
    expect(createVcard(contact)).toBe([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Silva Santos;Ana Maria;;;',
      'FN:Ana Maria Silva Santos',
      'TEL;type=CELL;type=VOICE;waid=5511999999999:+5511999999999',
      'END:VCARD',
    ].join('\n'))
    expect(createVcard({ ...contact, displayName: '' })).toContain('\nFN:\n')
    expect(createVcard({ ...contact, organization: '', email: '', url: '' })).toBe(createVcard(contact))
  })

  test('escapes text without changing structural delimiters and round-trips parsed fields', () => {
    const vcard = createVcard({
      ...contact,
      firstName: 'Ana; Maria',
      lastName: 'Silva, Santos\\Filho',
      displayName: 'Ana\r\nMaria\rSilva\nSantos;\\,',
      organization: 'Empresa; Brasil, \\ Suporte',
      email: 'ana;,\\@example.test',
      url: 'https://example.test/a;b,c?q=one,two;three',
    })
    expect(vcard).toBe([
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Silva\\, Santos\\\\Filho;Ana\\; Maria;;;',
      'FN:Ana\\nMaria\\nSilva\\nSantos\\;\\\\\\,',
      'ORG:Empresa\\; Brasil\\, \\\\ Suporte;',
      'EMAIL:ana\\;\\,\\\\@example.test',
      'URL:https://example.test/a;b,c?q=one,two;three',
      'TEL;type=CELL;type=VOICE;waid=5511999999999:+5511999999999',
      'END:VCARD',
    ].join('\n'))
    expect(parseVcard(vcard)).toEqual({
      name: 'Ana\nMaria\nSilva\nSantos;\\,',
      firstName: 'Ana; Maria',
      lastName: 'Silva, Santos\\Filho',
      phones: [{ number: '+5511999999999', waid: '5511999999999', types: ['CELL', 'VOICE'] }],
      emails: ['ana;,\\@example.test'],
      organization: 'Empresa; Brasil, \\ Suporte',
    })
  })

  test('rejects URL line injection and non-phone or injected JIDs with a 400 error', () => {
    const invalidContacts = [
      ...['https://example.test/\rX:bad', 'https://example.test/\nX:bad', 'https://example.test/\r\nX:bad'].map((url) => ({ ...contact, url })),
      ...['123@lid', '123@g.us', '123:4@s.whatsapp.net', '123@s.whatsapp.net\nTEL:bad', '@s.whatsapp.net', 'abc@s.whatsapp.net'].map((wuid) => ({ ...contact, wuid })),
    ]
    for (const invalid of invalidContacts) {
      try {
        createVcard(invalid)
        throw new Error('Expected createVcard to reject the input')
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestError)
        expect(error).toHaveProperty('status', 400)
      }
    }
  })
})

describe('shared vCards', () => {
  test('preserves the API vCard and falls back from FN:undefined to the structured name', () => {
    expect(normalizeVcardContact({ vcard: sentVcard })).toEqual({
      name: 'Contato de teste Zappaz', vcard: sentVcard,
      parsed: { name: 'Contato de teste Zappaz', firstName: 'Contato', lastName: 'de teste Zappaz', phones: [{ number: '+5511999999999', waid: '5511999999999', types: ['CELL', 'VOICE'] }], emails: [], organization: null },
    })
  })

  test('preserves the received vCard and uses displayName before FN and N', () => {
    expect(normalizeVcardContact({ displayName: 'Nome local ao compartilhamento', vcard: receivedVcard })).toMatchObject({ name: 'Nome local ao compartilhamento', vcard: receivedVcard, parsed: { name: 'Maria', firstName: 'Maria', lastName: null, phones: [{ number: '+55 11 90000-0000', waid: '5511900000000', types: ['CELL', 'VOICE'] }] } })
    expect(normalizeVcardContact({ displayName: 'undefined', vcard: receivedVcard }).name).toBe('Maria')
  })

  test('handles CRLF, folded lines, escaped delimiters, grouped properties and repeated parameters', () => {
    const vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Silva;Ana;;;\r\nFN:Ana\\, Silva\\nSuporte\r\nORG:Empresa\\; Brasil;Aten\r\n dimento\r\nitem1.TEL;TYPE="CELL,VOICE";TYPE=CELL;waid=123:tel:+123\r\nTEL;HOME:+456\r\nEMAIL:ana@example.com\r\nEMAIL:mailto:suporte@example.com\r\nEND:VCARD\r\n'
    expect(normalizeVcardContact({ vcard })).toEqual({ name: 'Ana, Silva\nSuporte', vcard, parsed: { name: 'Ana, Silva\nSuporte', firstName: 'Ana', lastName: 'Silva', phones: [{ number: '+123', waid: '123', types: ['CELL', 'VOICE'] }, { number: '+456', waid: null, types: ['HOME'] }], emails: ['ana@example.com', 'suporte@example.com'], organization: 'Empresa; Brasil / Atendimento' } })
  })

  test('does not discard original content when missing, malformed or unsupported', () => {
    for (const vcard of ['', 'BEGIN:VCARD', 'not a vcard', 'BEGIN:VCARD\nVERSION:3.0\nEND:VCARD', 'BEGIN:VCARD\nFN;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9\nEND:VCARD']) {
      expect(normalizeVcardContact({ displayName: 'Contato', vcard })).toEqual({ name: 'Contato', vcard, parsed: null })
    }
    expect(normalizeVcardContact({})).toEqual({ name: null, vcard: null, parsed: null })
    expect(parseVcard('BEGIN:VCARD\nFN:Um\nBEGIN:VCARD\nFN:Dois\nEND:VCARD\nEND:VCARD')).toBeNull()
  })

  test('never infers a WhatsApp identifier from a phone number', () => {
    expect(parseVcard('BEGIN:VCARD\nVERSION:4.0\nFN:Contato\nTEL;VALUE=uri;TYPE=cell:tel:+5511999999999\nEND:VCARD')?.phones).toEqual([{ number: '+5511999999999', waid: null, types: ['CELL'] }])
  })

  test('normalizes singles, lists and quoted contacts without mixing phone or sender identity', () => {
    const base = { key: { id: 'contact-example', fromMe: false, remoteJid: '123456789012345@lid', remoteJidAlt: '5511900000000@s.whatsapp.net', addressingMode: 'lid' }, messageTimestamp: 1793652304 }
    const contact = { displayName: 'Maria', vcard: receivedVcard }
    const single = normalizeWhatsappMessage('session', { ...base, message: { contactMessage: contact } })
    expect(single.contacts).toEqual([normalizeVcardContact(contact)])
    const list = normalizeWhatsappMessage('session', { ...base, message: { contactsArrayMessage: { contacts: [contact, { vcard: sentVcard }] } } })
    expect(list.contacts).toEqual([normalizeVcardContact(contact), normalizeVcardContact({ vcard: sentVcard })])
    expect(list.remoteJid).toBe('5511900000000@s.whatsapp.net')
    expect(list.lid).toBe('123456789012345@lid')
    expect(list.contacts?.[1]?.parsed?.phones[0]?.waid).toBe('5511999999999')
    const quoted = normalizeWhatsappMessage('session', { ...base, message: { extendedTextMessage: { text: 'Este contato', contextInfo: { stanzaId: 'contact-message', quotedMessage: { contactsArrayMessage: { contacts: [contact, { vcard: sentVcard }] } } } } } })
    expect(quoted.replyTo?.contacts).toEqual(list.contacts)
    const wrapped = normalizeWhatsappMessage('session', { ...base, message: { ephemeralMessage: { message: { contactMessage: contact } } } })
    expect(wrapped.contacts).toEqual(single.contacts)
  })
})
