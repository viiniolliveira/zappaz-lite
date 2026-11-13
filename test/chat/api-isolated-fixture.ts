import { strict as assert } from 'node:assert'
import { decodeChatCursor, encodeChatCursor } from '../../server/src/lib/chat-cursor.ts'
import { contactDTO, mediaDTO, messageDTO } from '../../server/src/lib/chat-dto.ts'
import { ContactSchema } from '../../server/src/lib/chat-contract.ts'
import { sentVcard, receivedVcard } from '../whatsapp/vcard-fixture.ts'
import { normalizeVcardContact } from '../../server/src/lib/vcard.ts'

const id = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'
const mediaId = '00000000-0000-4000-8000-000000000003'
const date = new Date('2025-01-01T00:00:00Z')
const scope = JSON.stringify(['messages', 'session-a', conversationId])
const cursor = encodeChatCursor(scope, id, date.toISOString())
assert.deepEqual(decodeChatCursor(cursor, scope), { scope, id, value: date.toISOString() })
assert.equal(decodeChatCursor(undefined, scope), null)
assert.equal(decodeChatCursor(encodeChatCursor(scope, id, null), scope)?.value, null)
for (const invalid of [cursor + '.extra', cursor.replace(/^./, cursor[0] === 'A' ? 'B' : 'A'), 'broken', 'x'.repeat(4097)]) {
  assert.throws(() => decodeChatCursor(invalid, scope), /Invalid pagination cursor/)
}
assert.throws(() => decodeChatCursor(cursor, JSON.stringify(['messages', 'session-b', conversationId])), /Invalid pagination cursor/)
assert.throws(() => decodeChatCursor(cursor, JSON.stringify(['messages', 'session-a', id])), /Invalid pagination cursor/)

const base = { sessionId: 'session/a', createdAt: date, updatedAt: date, revision: 1 }
const contact = { ...base, id, jid: '123@s.whatsapp.net', name: '', pushName: 'Push', phoneNumber: '123', avatarUrl: null, avatarCheckedAt: null, isSaved: false, localName: null }
assert.equal(contactDTO(contact).displayName, 'Push')
assert.equal(contactDTO(contact).isSaved, false)
assert.equal(contactDTO(contact).localName, null)
assert.equal(contactDTO(contact).avatarCheckedAt, null)
assert.equal(contactDTO({ ...contact, avatarCheckedAt: date }).avatarCheckedAt, date.toISOString())
const { avatarCheckedAt: _checkedAt, ...withoutCheckedAt } = contactDTO(contact)
assert.equal(ContactSchema.safeParse(withoutCheckedAt).success, false)
assert.equal(ContactSchema.safeParse({ ...contactDTO(contact), avatarCheckedAt: 'not-a-date' }).success, false)
const savedContact = contactDTO({ ...contact, isSaved: true, localName: 'Local', name: 'WhatsApp' })
assert.equal(savedContact.displayName, 'Local')
assert.equal(savedContact.localName, 'Local')
assert.equal(savedContact.isSaved, true)
assert.equal(savedContact.email, null)
assert.equal(savedContact.annotations, null)
const detailedContact = contactDTO({ ...contact, isSaved: true, localName: 'Local', email: 'local@example.com', annotations: 'Nota local' })
assert.equal(detailedContact.email, 'local@example.com')
assert.equal(detailedContact.annotations, 'Nota local')
assert.equal(contactDTO({ ...contact, name: 'WhatsApp' }).displayName, 'WhatsApp')
assert.equal(contactDTO({ ...contact, pushName: '' }).displayName, '123')
assert.equal(contactDTO({ ...contact, pushName: '', phoneNumber: null }).displayName, contact.jid)
const media = { ...base, id: mediaId, conversationId, messageId: id, kind: 'image', mimeType: 'image/jpeg', fileName: null, size: null, duration: null, width: null, height: null, voice: false, thumbnailBase64: 'preview', thumbnailMimeType: 'image/jpeg', thumbnailWidth: null, thumbnailHeight: null, storage: 's3', key: 'secret-storage-key', persistedAt: null, storageStatus: 'ready' }
const message = { ...base, id, conversationId, messageId: 'wa-id', clientRequestId: null, fromMe: false, senderJid: null, senderName: null, type: 'image', text: null, hasLink: false, status: null, sentAt: null, orderAt: date, editedAt: null, deletedAt: null, rawContent: { secret: 'raw-secret' }, content: { mentions: ['a'], reactions: [], replyTo: { id: 'quoted', text: 'hello' } }, media }
assert.equal(messageDTO({ ...message, hasLink: true }).hasLink, true)
assert.equal(messageDTO({ ...message, hasLink: false }).hasLink, false)
assert.equal(messageDTO({ ...message, hasLink: true, deletedAt: date }).hasLink, false)
const dto = messageDTO(message)
assert.equal(dto.linkPreview, null)
const location = { latitude: 0, longitude: 0, name: 'Local', address: null, thumbnail: { mimeType: 'image/jpeg', base64: 'preview', width: 80, height: 60 } }
assert.deepEqual(messageDTO({ ...message, content: { location } }).location, { ...location, url: null })
const place = { name: 'Google São Paulo', address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil', url: 'www.google.com' }
assert.deepEqual(messageDTO({ ...message, type: 'location', content: { location: place } }).location, { ...place, latitude: null, longitude: null, thumbnail: null })
assert.equal(messageDTO({ ...message, deletedAt: date, content: { location } }).location, null)
const linkPreview = { url: 'https://example.com/article', title: 'Article', description: 'Summary', thumbnail: null }
assert.deepEqual(messageDTO({ ...message, content: { linkPreview } }).linkPreview, linkPreview)
assert.equal(messageDTO({ ...message, deletedAt: date, content: { linkPreview } }).linkPreview, null)
assert.equal(dto.media?.thumbnail?.base64, 'preview')
assert.equal(dto.media?.contentPath, `/api/v1/session/session%2Fa/conversations/${conversationId}/media/${mediaId}/content`)
assert.equal(dto.replyTo?.messageId, 'quoted')
const shared = normalizeVcardContact({ vcard: sentVcard })
const received = normalizeVcardContact({ displayName: 'Maria', vcard: receivedVcard })
const sharedDTO = messageDTO({ ...message, type: 'contact', content: { contacts: [shared, received], replyTo: { id: 'quoted-contact', type: 'contact', contacts: [shared] } } })
assert.deepEqual(sharedDTO.contacts, [shared, received])
assert.equal(sharedDTO.contacts[0].vcard, sentVcard)
assert.deepEqual(sharedDTO.replyTo?.contacts, [shared])
const stored = { ...shared, parsed: { ...shared.parsed, name: 'Nome extraído na entrada' } }
assert.deepEqual(messageDTO({ ...message, type: 'contact', content: { contacts: [stored] } }).contacts[0], stored)
assert.throws(() => messageDTO({ ...message, type: 'contact', content: { contacts: [{ name: 'Contato', vcard: sentVcard }] } }))
const malformed = messageDTO({ ...message, type: 'contact', content: { contacts: [normalizeVcardContact({ displayName: 'Contato', vcard: 'broken' })] } })
assert.deepEqual(malformed.contacts, [{ name: 'Contato', vcard: 'broken', parsed: null }])
assert.deepEqual(messageDTO({ ...message, deletedAt: date, content: { contacts: [shared], replyTo: { id: 'quoted-contact', contacts: [shared] } } }).contacts, [])
const replyThumbnail = { mimeType: 'image/jpeg', base64: 'preview', width: 13, height: 7 }
const quotedMedia = messageDTO({ ...message, content: { replyTo: { id: 'external-photo', type: 'image', fromMe: true, media: { mimeType: 'image/jpeg', thumbnail: replyThumbnail, mediaKey: 'secret-quoted-key' } } } })
assert.equal(quotedMedia.replyTo?.fromMe, true)
assert.deepEqual(quotedMedia.replyTo?.media?.thumbnail, replyThumbnail)
assert.ok(!JSON.stringify(quotedMedia).includes('secret-quoted-key'))
assert.ok(!JSON.stringify(dto).includes('raw-secret'))
assert.ok(!JSON.stringify(dto).includes('secret-storage-key'))
assert.ok(!('key' in mediaDTO(media)))
const deleted = messageDTO({ ...message, text: 'deleted secret', deletedAt: date })
assert.equal(deleted.text, null)
assert.equal(deleted.media, null)
assert.equal(deleted.replyTo, null)
assert.deepEqual(deleted.mentions, [])
assert.deepEqual(deleted.reactions, [])
