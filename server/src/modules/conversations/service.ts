import { prisma } from '@db/prisma'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { config } from '../../config.ts'
import { decodeChatCursor, encodeChatCursor } from '../../lib/chat-cursor.ts'
import { conversationDTO } from '../../lib/chat-dto.ts'
import { publishChatChange } from '../../lib/chat-events.ts'
import { conversationIdentityWhere, ensureChatContact } from '../../lib/chat-identity.ts'
import { withConversationMediaLock } from '../../lib/chat-media-lock.ts'
import { chatTransaction, privateJid } from '../../lib/chat-store.ts'
import { cleanupConversationMedia } from '../../lib/conversation-media-cleanup.ts'
import { getMediaStorage } from '../../lib/media-storage.ts'
import type { ConversationQuery } from './types.ts'

export async function getConversation(sessionId: string, conversationId: string) {
  const dto = await conversationDTO(sessionId, conversationId)
  if (!dto) throw new NotFoundError('Conversation not found')
  return dto
}
export async function listConversations(sessionId: string, query: ConversationQuery) {
  const scope = JSON.stringify(['conversations', sessionId, query.q, query.labelId ?? null])
  const cursor = decodeChatCursor(query.cursor, scope)
  const rows = await prisma.waConversation.findMany({
    where: {
      sessionId,
      isGroup: false,
      messages: { some: { sessionId } },
      ...(query.labelId ? { labels: { some: { sessionId, labelId: query.labelId } } } : {}),
      AND: [
        {
          OR: [
            { jid: { contains: query.q, mode: 'insensitive' } },
            {
              contact: {
                OR: [
                  { localName: { contains: query.q, mode: 'insensitive' } },
                  { name: { contains: query.q, mode: 'insensitive' } },
                  { pushName: { contains: query.q, mode: 'insensitive' } },
                  { phoneNumber: { contains: query.q } },
                  { lid: { contains: query.q } },
                ],
              },
            },
          ],
        },
        ...(cursor
          ? [
              cursor.value
                ? {
                    OR: [
                      { lastActivityAt: { lt: new Date(cursor.value) } },
                      {
                        lastActivityAt: new Date(cursor.value),
                        id: { lt: cursor.id },
                      },
                      { lastActivityAt: null },
                    ],
                  }
                : { lastActivityAt: null, id: { lt: cursor.id } },
            ]
          : []),
      ],
    },
    orderBy: [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: query.limit + 1,
  })
  const selected = rows.slice(0, query.limit)
  const data = await Promise.all(selected.map((row) => getConversation(sessionId, row.id)))
  const last = selected.at(-1)
  return {
    status: 'success' as const,
    data,
    page: {
      hasMore: rows.length > query.limit,
      nextCursor:
        rows.length > query.limit && last
          ? encodeChatCursor(scope, last.id, last.lastActivityAt?.toISOString() ?? null)
          : null,
    },
  }
}
export async function createConversation(
  sessionId: string,
  input: { contactId: string } | { phoneNumber: string },
) {
  const result = await chatTransaction(sessionId, async (tx) => {
    const contact =
      'contactId' in input
        ? await tx.waContact.findFirst({
            where: { sessionId, id: input.contactId },
          })
        : (await ensureChatContact(tx, sessionId, `${input.phoneNumber}@s.whatsapp.net`)).contact
    if (!(contact && privateJid(contact.jid))) throw new NotFoundError('Contact not found')
    const existing = await tx.waConversation.findFirst({
      where: { sessionId, ...conversationIdentityWhere(contact.jid) },
    })
    if (existing) return { id: existing.id, created: false }
    const saved = await tx.waConversation.create({
      data: { sessionId, jid: contact.jid, contactId: contact.id },
    })
    return { id: saved.id, created: true }
  })
  publishChatChange({ sessionId, conversationId: result.id })
  return {
    data: await getConversation(sessionId, result.id),
    created: result.created,
  }
}
export async function readConversation(
  sessionId: string,
  conversationId: string,
  messageId: string,
) {
  await chatTransaction(sessionId, async (tx) => {
    const conversation = await tx.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
    })
    const message = await tx.waMessage.findFirst({
      where: { sessionId, conversationId, id: messageId },
    })
    if (!(conversation && message)) throw new NotFoundError('Message not found')
    if (
      conversation.lastReadOrderAt &&
      (message.orderAt < conversation.lastReadOrderAt ||
        (message.orderAt.getTime() === conversation.lastReadOrderAt.getTime() &&
          message.id <= (conversation.lastReadMessageId ?? '')))
    )
      return
    const unreadCount = await tx.waMessage.count({
      where: {
        sessionId,
        conversationId,
        fromMe: false,
        content: { path: ['liveReceived'], equals: true },
        OR: [
          { orderAt: { gt: message.orderAt } },
          { orderAt: message.orderAt, id: { gt: message.id } },
        ],
      },
    })
    await tx.waConversation.update({
      where: { id: conversationId },
      data: {
        lastReadMessageId: message.id,
        lastReadOrderAt: message.orderAt,
        unreadCount,
        revision: { increment: 1 },
      },
    })
  })
  publishChatChange({ sessionId, conversationId })
  return getConversation(sessionId, conversationId)
}

export async function setConversationReadState(
  sessionId: string,
  conversationId: string,
  read: boolean,
) {
  await chatTransaction(sessionId, async (tx) => {
    const conversation = await tx.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
    })
    if (!conversation) throw new NotFoundError('Conversation not found')
    const last = await tx.waMessage.findFirst({
      where: { sessionId, conversationId },
      orderBy: [{ orderAt: 'desc' }, { id: 'desc' }],
    })
    if (!last) throw new NotFoundError('Message not found')
    await tx.waConversation.update({
      where: { id: conversationId },
      data: {
        unreadCount: read ? 0 : Math.max(1, conversation.unreadCount),
        lastReadMessageId: read ? last.id : null,
        lastReadOrderAt: read ? last.orderAt : null,
        revision: { increment: 1 },
      },
    })
  })
  publishChatChange({ sessionId, conversationId })
  return getConversation(sessionId, conversationId)
}

export async function deleteConversation(sessionId: string, conversationId: string) {
  const activeStorage = getMediaStorage(config.mediaStorage)
  const driver = config.mediaStorage.driver
  const configuredStorage = activeStorage?.name ?? (driver === 'fs' ? 'local' : 's3')
  const deletion = await withConversationMediaLock(sessionId, conversationId, async (tx) => {
    // Acquire the ingestion lock only after any outstanding file write finishes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`
    const previous = await tx.waConversationDeletion.findFirst({
      where: { sessionId, conversationId },
    })
    if (previous) return previous
    const conversation = await tx.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
    })
    if (!conversation) throw new NotFoundError('Conversation not found')
    const media = await tx.waMessageMedia.findMany({
      where: { sessionId, conversationId },
      select: { storage: true },
    })
    // Include the configured prefix even when persistence is off or rows were pruned.
    const storages = [
      ...new Set([
        ...media.flatMap((item) => (item.storage ? [item.storage] : [])),
        configuredStorage,
      ]),
    ]
    const deletedAt = new Date()
    const receipt = await tx.waConversationDeletion.create({
      data: {
        conversationId,
        sessionId,
        jid: conversation.jid,
        deletedAt,
        historyBefore:
          conversation.lastActivityAt && conversation.lastActivityAt > deletedAt
            ? conversation.lastActivityAt
            : deletedAt,
        storages,
        filesDeletedAt: storages.length ? null : deletedAt,
      },
    })
    await tx.waConversation.delete({ where: { id: conversationId } })
    return receipt
  })
  publishChatChange({
    sessionId,
    deletedConversation: {
      conversationId,
      deletedAt: deletion.deletedAt.toISOString(),
    },
  })
  const complete = await cleanupConversationMedia(sessionId, conversationId)
  return {
    conversationId,
    mediaCleanup: complete ? ('complete' as const) : ('pending' as const),
  }
}
