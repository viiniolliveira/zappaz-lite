import { prisma } from '@db/prisma'
import { Prisma } from '@generated/prisma'
import { AppError } from '../../common/errors/app-error.ts'
import { ConflictError } from '../../common/errors/conflict-error.ts'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { decodeChatCursor, encodeChatCursor } from '../../lib/chat-cursor.ts'
import { contactDTO } from '../../lib/chat-dto.ts'
import { publishChatChange } from '../../lib/chat-events.ts'
import { ensureChatContact } from '../../lib/chat-identity.ts'
import { chatTransaction } from '../../lib/chat-store.ts'
import { whatsappService } from '../../services/whatsapp.ts'
import type { ContactQuery, SaveContactInput, UpdateContactInput } from './types.ts'

const AVATAR_CACHE_MS = 60 * 60 * 1000
const avatarRefreshes = new Map<string, Promise<ReturnType<typeof contactDTO>>>()

export async function refreshContactAvatar(sessionId: string, contactId: string) {
  const key = JSON.stringify([sessionId, contactId])
  const pending = avatarRefreshes.get(key)
  if (pending) return pending
  const task = refreshAvatar(sessionId, contactId)
  avatarRefreshes.set(key, task)
  try {
    return await task
  } finally {
    avatarRefreshes.delete(key)
  }
}

async function refreshAvatar(sessionId: string, contactId: string) {
  const where = {
    sessionId,
    id: contactId,
    conversations: { some: { isGroup: false, messages: { some: {} } } },
  }
  const contact = await prisma.waContact.findFirst({ where })
  if (!contact) throw new NotFoundError('Contato com conversa não encontrado')
  if (contact.avatarCheckedAt && Date.now() - contact.avatarCheckedAt.getTime() < AVATAR_CACHE_MS)
    return contactDTO(contact)
  if (!whatsappService.isSessionEnabled(sessionId))
    throw new AppError({ status: 409, code: 'SESSION_NOT_ENABLED', message: 'Session is disabled' })
  if (!whatsappService.isSessionConnected(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_CONNECTED',
      message: 'Session is disconnected',
    })
  const jid = contact.phoneNumber ? `${contact.phoneNumber}@s.whatsapp.net` : contact.jid
  let avatarUrl: string | null
  try {
    avatarUrl = await whatsappService.getContactProfilePictureUrl(sessionId, jid)
  } catch (cause) {
    throw new AppError({
      status: 503,
      code: 'PROFILE_PICTURE_UNAVAILABLE',
      message: 'Não foi possível atualizar a foto de perfil',
      cause,
    })
  }
  const avatarCheckedAt = new Date()
  const updated = await chatTransaction(sessionId, async (tx) => {
    // A conversation can be deleted while WhatsApp is answering the lookup.
    const current = await tx.waContact.findFirst({ where })
    if (!current) throw new NotFoundError('Contato com conversa não encontrado')
    await tx.waConversation.updateMany({
      where: { sessionId, contactId },
      data: { revision: { increment: 1 } },
    })
    return tx.waContact.update({
      where: { sessionId, id: contactId },
      data: { avatarUrl, avatarCheckedAt, revision: { increment: 1 } },
    })
  })
  await publishContact(sessionId, contactId)
  return contactDTO(updated)
}

export async function listContacts(sessionId: string, query: ContactQuery) {
  const scope = JSON.stringify(['saved-contacts', sessionId, query.q])
  const cursor = decodeChatCursor(query.cursor, scope)
  const name = Prisma.sql`COALESCE(NULLIF("localName", ''), NULLIF("name", ''), NULLIF("pushName", ''), "phoneNumber", "jid")`
  const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`
  const rows = await prisma.$queryRaw<
    Array<{ id: string }>
  >(Prisma.sql`SELECT "id" FROM "WaContact" WHERE "sessionId" = ${sessionId} AND "isSaved" = true
    AND (${name} ILIKE ${pattern} OR "jid" ILIKE ${pattern} OR "phoneNumber" ILIKE ${pattern} OR "lid" ILIKE ${pattern})
    ${cursor ? Prisma.sql`AND (${name}, "id") > (${cursor.value}, ${cursor.id})` : Prisma.empty}
    ORDER BY ${name} ASC, "id" ASC LIMIT ${query.limit + 1}`)
  const selected = rows.slice(0, query.limit)
  const contacts = await prisma.waContact.findMany({
    where: {
      sessionId,
      isSaved: true,
      id: { in: selected.map((row) => row.id) },
    },
  })
  const data = selected.flatMap(({ id }) => {
    const contact = contacts.find((row) => row.id === id)
    return contact ? [contactDTO(contact)] : []
  })
  const last = data.at(-1)
  return {
    status: 'success' as const,
    data,
    page: {
      hasMore: rows.length > query.limit,
      nextCursor:
        rows.length > query.limit && last
          ? encodeChatCursor(scope, last.id, last.displayName)
          : null,
    },
  }
}

async function publishContact(sessionId: string, contactId: string) {
  publishChatChange({ sessionId, contactId })
  const conversations = await prisma.waConversation.findMany({
    where: { sessionId, contactId, isGroup: false },
    select: { id: true },
  })
  for (const conversation of conversations)
    publishChatChange({ sessionId, conversationId: conversation.id })
}

export async function saveContact(sessionId: string, input: SaveContactInput) {
  const contact = await chatTransaction(sessionId, async (tx) => {
    const { contact } = await ensureChatContact(
      tx,
      sessionId,
      `${input.phoneNumber}@s.whatsapp.net`,
    )
    if (contact.isSaved)
      throw new ConflictError('Este telefone já está salvo nos contatos desta sessão')
    await tx.waConversation.updateMany({
      where: { sessionId, contactId: contact.id },
      data: { revision: { increment: 1 } },
    })
    return tx.waContact.update({
      where: { id: contact.id },
      data: {
        isSaved: true,
        localName: input.name,
        email: input.email || null,
        annotations: input.annotations || null,
        revision: { increment: 1 },
      },
    })
  })
  await publishContact(sessionId, contact.id)
  return contactDTO(contact)
}

export async function updateContact(
  sessionId: string,
  contactId: string,
  input: UpdateContactInput,
) {
  return changeSavedContact(sessionId, contactId, {
    localName: input.name,
    ...(input.email !== undefined ? { email: input.email || null } : {}),
    ...(input.annotations !== undefined ? { annotations: input.annotations || null } : {}),
  })
}

export async function saveExistingContact(
  sessionId: string,
  contactId: string,
  input: UpdateContactInput,
) {
  return changeSavedContact(
    sessionId,
    contactId,
    {
      localName: input.name,
      isSaved: true,
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.annotations !== undefined ? { annotations: input.annotations || null } : {}),
    },
    false,
  )
}

export async function deleteContact(sessionId: string, contactId: string) {
  return changeSavedContact(sessionId, contactId, {
    isSaved: false,
    localName: null,
    email: null,
    annotations: null,
  })
}

async function changeSavedContact(
  sessionId: string,
  contactId: string,
  data: {
    localName: string | null
    isSaved?: boolean
    email?: string | null
    annotations?: string | null
  },
  requireSaved = true,
) {
  const contact = await chatTransaction(sessionId, async (tx) => {
    const existing = await tx.waContact.findFirst({
      where: {
        sessionId,
        id: contactId,
        ...(requireSaved ? { isSaved: true } : {}),
      },
    })
    if (!existing) throw new NotFoundError('Contato não encontrado')
    await tx.waConversation.updateMany({
      where: { sessionId, contactId },
      data: { revision: { increment: 1 } },
    })
    return tx.waContact.update({
      where: { id: contactId },
      data: { ...data, revision: { increment: 1 } },
    })
  })
  await publishContact(sessionId, contact.id)
  return contactDTO(contact)
}
