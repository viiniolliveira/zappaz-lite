import type { Contact, WAMessageKey } from 'baileys'
import { contactIdentifiers, messageContactIdentifiers } from './chat-identity.ts'

export type LookupPhone = (lid: string) => Promise<string | null>

export async function resolveContactPhone(contact: Partial<Contact>, lookup: LookupPhone) {
  const { lid, phoneNumber } = contactIdentifiers([contact.id, contact.lid, contact.phoneNumber])
  if (!lid || phoneNumber) return contact
  const pn = await lookup(lid)
  if (pn) contactIdentifiers([contact.id, contact.lid, pn])
  return pn ? { ...contact, phoneNumber: pn } : contact
}

export async function resolveMessagePhone(key: WAMessageKey, lookup: LookupPhone) {
  const { lid, phoneNumber } = contactIdentifiers(messageContactIdentifiers(key))
  if (!lid || phoneNumber) return key
  const pn = await lookup(lid)
  if (pn) contactIdentifiers([key.remoteJid, pn])
  return pn ? { ...key, remoteJidAlt: pn } : key
}
