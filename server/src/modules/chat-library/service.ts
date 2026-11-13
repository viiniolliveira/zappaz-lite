import { prisma } from '@db/prisma'
import { LibraryEntrySchema } from '../../lib/chat-contract.ts'
import { decodeChatCursor, encodeChatCursor } from '../../lib/chat-cursor.ts'
import { contactDTO, messageDTO } from '../../lib/chat-dto.ts'
import { getConversation } from '../conversations/service.ts'
import type { LibraryMessageWhere, LibraryQuery } from './types.ts'

export async function listLibrary(sessionId: string, query: LibraryQuery) {
  if (query.conversationId) await getConversation(sessionId, query.conversationId)
  const scope = JSON.stringify(['library', sessionId, query.conversationId ?? null, query.kind])
  const cursor = decodeChatCursor(query.cursor, scope)
  const where: LibraryMessageWhere = {
    sessionId,
    conversationId: query.conversationId,
    conversation: { isGroup: false },
    deletedAt: null,
    ...(query.kind === 'all'
      ? {
          OR: [
            { hasLink: true },
            { type: { in: ['image', 'video', 'audio', 'document'] }, media: { isNot: null } },
          ],
        }
      : query.kind === 'link'
        ? { hasLink: true }
        : {
            type:
              query.kind === 'media'
                ? { in: query.conversationId ? ['image', 'video', 'audio'] : ['image', 'video'] }
                : 'document',
            media: { isNot: null },
          }),
  }
  const [count, rows] = await prisma.$transaction([
    prisma.waMessage.count({ where }),
    prisma.waMessage.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { orderAt: { lt: new Date(cursor.value ?? '') } },
                    { orderAt: new Date(cursor.value ?? ''), id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ orderAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { media: true, conversation: { include: { contact: true } } },
    }),
  ])
  const selected = rows.slice(0, query.limit)
  const last = selected.at(-1)
  const hasMore = rows.length > query.limit
  return {
    status: 'success' as const,
    data: selected.map((message) => {
      const { conversation } = message
      const contact = conversation.contact ? contactDTO(conversation.contact) : null
      return LibraryEntrySchema.parse({
        message: messageDTO(message),
        conversation: {
          id: conversation.id,
          sessionId,
          displayName: contact?.displayName ?? conversation.jid,
          avatarUrl: contact?.avatarUrl ?? null,
        },
      })
    }),
    count,
    page: {
      hasMore,
      nextCursor:
        hasMore && last ? encodeChatCursor(scope, last.id, last.orderAt.toISOString()) : null,
    },
  }
}
