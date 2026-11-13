import type { Prisma, WaContact } from '@generated/prisma'
import { jidNormalizedUser, type WAMessageKey } from 'baileys'
import { AppError } from '../common/errors/app-error.ts'

function privateIdentifier(value?: string | null) {
  if (!value) return null
  const jid = jidNormalizedUser(value)
  return /^\d+@(s\.whatsapp\.net|lid)$/.test(jid) ? jid : null
}

export function contactIdentifiers(jids: readonly (string | null | undefined)[]) {
  let phoneNumber: string | undefined
  let lid: string | undefined
  for (const value of jids) {
    const jid = privateIdentifier(value)
    if (!jid) continue
    if (jid.endsWith('@lid')) {
      if (lid && lid !== jid) throw identityConflict()
      lid = jid
    } else {
      const phone = jid.split('@')[0]
      if (phoneNumber && phoneNumber !== phone) throw identityConflict()
      phoneNumber = phone
    }
  }
  return { phoneNumber, lid }
}

export function messageContactIdentifiers(key: WAMessageKey) {
  const primary = privateIdentifier(key.remoteJid)
  if (!primary) return []
  const mode = primary.endsWith('@lid') ? 'lid' : 'pn'
  if (key.addressingMode && key.addressingMode !== mode) throw identityConflict()
  const alternate = privateIdentifier(key.remoteJidAlt)
  return [primary, alternate]
}

export function contactJids(contact: Pick<WaContact, 'jid' | 'phoneNumber' | 'lid'>) {
  return [
    ...new Set([
      contact.jid,
      ...(contact.phoneNumber ? [`${contact.phoneNumber}@s.whatsapp.net`] : []),
      ...(contact.lid ? [contact.lid] : []),
    ]),
  ]
}

export function conversationIdentityWhere(jid: string): Prisma.WaConversationWhereInput {
  const normalized = jidNormalizedUser(jid)
  const { phoneNumber, lid } = contactIdentifiers([normalized])
  if (!(phoneNumber || lid)) return { jid: normalized }
  return {
    OR: [
      { jid: normalized },
      {
        contact: {
          OR: [
            { jid: normalized },
            ...(phoneNumber ? [{ phoneNumber }] : []),
            ...(lid ? [{ lid }] : []),
          ],
        },
      },
    ],
  }
}

function identityConflict() {
  return new AppError({
    status: 409,
    code: 'CONTACT_IDENTITY_CONFLICT',
    message: 'Conflicting WhatsApp contact identifiers; existing history was preserved',
  })
}

export function isContactIdentityConflict(error: unknown): error is AppError {
  return error instanceof AppError && error.code === 'CONTACT_IDENTITY_CONFLICT'
}

/** Called under the session ingestion lock; associations require explicit payload evidence. */
export async function ensureChatContact(
  tx: Prisma.TransactionClient,
  sessionId: string,
  jid: string,
  fields: {
    name?: string | null
    pushName?: string | null
    avatarUrl?: string | null
  } = {},
  aliases: readonly (string | null | undefined)[] = [],
) {
  const identifiers = contactIdentifiers([jid, ...aliases])
  const jids = [
    jidNormalizedUser(jid),
    ...aliases.flatMap((value) => privateIdentifier(value) ?? []),
  ]
  const contacts = await tx.waContact.findMany({
    where: {
      sessionId,
      OR: [
        { jid: { in: jids } },
        ...(identifiers.phoneNumber ? [{ phoneNumber: identifiers.phoneNumber }] : []),
        ...(identifiers.lid ? [{ lid: identifiers.lid }] : []),
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const combined = contactIdentifiers([...jids, ...contacts.flatMap(contactJids)])
  if (!contacts.length)
    return {
      contact: await tx.waContact.create({
        data: { sessionId, jid, ...combined, ...fields },
      }),
      changed: true,
    }
  const conversations = await tx.waConversation.findMany({
    where: {
      sessionId,
      isGroup: false,
      OR: [
        { contactId: { in: contacts.map((contact) => contact.id) } },
        {
          jid: {
            in: [...new Set([...jids, ...contacts.flatMap(contactJids)])],
          },
        },
      ],
    },
    select: { id: true, contactId: true },
  })
  if (conversations.length > 1) throw identityConflict()
  const existing =
    contacts.find((contact) => contact.id === conversations[0]?.contactId) ?? contacts[0]
  const redundant = contacts.filter((contact) => contact.id !== existing.id)
  const avatar = existing.avatarUrl
    ? existing
    : (redundant.find((contact) => contact.avatarUrl) ?? existing)
  const data = {
    isSaved: contacts.some((contact) => contact.isSaved),
    email: existing.email ?? redundant.find((contact) => contact.isSaved)?.email,
    annotations: existing.annotations ?? redundant.find((contact) => contact.isSaved)?.annotations,
    localName: existing.localName ?? redundant.find((contact) => contact.isSaved)?.localName,
    name: existing.name ?? redundant.find((contact) => contact.name)?.name,
    pushName: existing.pushName ?? redundant.find((contact) => contact.pushName)?.pushName,
    avatarUrl: avatar.avatarUrl,
    avatarCheckedAt:
      fields.avatarUrl !== undefined && fields.avatarUrl !== avatar.avatarUrl
        ? null
        : avatar.avatarCheckedAt,
    ...fields,
    ...combined,
  }
  if (redundant.length) {
    await tx.waConversation.updateMany({
      where: {
        sessionId,
        contactId: { in: redundant.map((contact) => contact.id) },
      },
      data: { contactId: existing.id, revision: { increment: 1 } },
    })
    await tx.waContact.deleteMany({
      where: { sessionId, id: { in: redundant.map((contact) => contact.id) } },
    })
  }
  const changed =
    redundant.length ||
    Object.entries(data).some(
      ([key, value]) => value !== undefined && existing[key as keyof typeof data] !== value,
    )
  if (!changed) return { contact: existing, changed: false }
  await tx.waConversation.updateMany({
    where: { sessionId, contactId: existing.id },
    data: { revision: { increment: 1 } },
  })
  return {
    contact: await tx.waContact.update({
      where: { id: existing.id },
      data: { ...data, revision: { increment: 1 } },
    }),
    changed: true,
  }
}
