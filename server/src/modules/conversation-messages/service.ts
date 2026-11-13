import { prisma } from '@db/prisma'
import type { Prisma } from '@generated/prisma'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { decodeChatCursor, encodeChatCursor } from '../../lib/chat-cursor.ts'
import { mediaDTO, messageDTO } from '../../lib/chat-dto.ts'
import { getConversation } from '../conversations/service.ts'
import type { MediaQuery, MessageQuery } from './types.ts'

export async function getChatMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
) {
  const message = await prisma.waMessage.findFirst({
    where: {
      sessionId,
      conversationId,
      id: messageRecordId,
      conversation: { isGroup: false },
    },
    include: { media: true },
  })
  if (!message) throw new NotFoundError('Message not found')
  return messageDTO(message)
}
export async function listMessages(sessionId: string, conversationId: string, query: MessageQuery) {
  await getConversation(sessionId, conversationId)
  const scope = JSON.stringify(['messages', sessionId, conversationId])
  return listMessagePage({ sessionId, conversationId }, scope, query)
}

export async function listMessagePage(
  where: Prisma.WaMessageWhereInput,
  scope: string,
  query: MessageQuery,
) {
  const cursor = decodeChatCursor(query.before ?? query.after, scope)
  const forward = !!query.after
  const rows = await prisma.waMessage.findMany({
    where: {
      ...where,
      ...(cursor
        ? {
            OR: [
              {
                orderAt: {
                  [forward ? 'gt' : 'lt']: new Date(cursor.value ?? ''),
                },
              },
              {
                orderAt: new Date(cursor.value ?? ''),
                id: { [forward ? 'gt' : 'lt']: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ orderAt: forward ? 'asc' : 'desc' }, { id: forward ? 'asc' : 'desc' }],
    take: query.limit + 1,
    include: { media: true },
  })
  const selected = rows.slice(0, query.limit)
  const hasMore = rows.length > query.limit
  const edge = selected.at(-1)
  if (!forward) selected.reverse()
  const first = selected[0],
    last = selected.at(-1)
  const encode = (row: (typeof rows)[number] | undefined) =>
    row ? encodeChatCursor(scope, row.id, row.orderAt.toISOString()) : null
  return {
    status: 'success' as const,
    data: selected.map(messageDTO),
    page: { hasMore, nextCursor: hasMore ? encode(edge) : null },
    boundaries: { first: encode(first), last: encode(last) },
  }
}
export async function listMedia(sessionId: string, conversationId: string, query: MediaQuery) {
  await getConversation(sessionId, conversationId)
  const gallery = query.kind === 'gallery'
  const scope = JSON.stringify(['message-media', sessionId, conversationId, query.kind ?? null])
  const cursor = decodeChatCursor(query.cursor, scope)
  const where: Prisma.WaMessageWhereInput = {
    sessionId,
    conversationId,
    deletedAt: null,
    conversation: { isGroup: false },
    media: {
      is: {
        kind:
          query.kind === 'gallery' ? { in: ['image', 'video', 'audio', 'document'] } : query.kind,
      },
    },
  }
  const [count, rows] = await prisma.$transaction([
    prisma.waMessage.count({ where }),
    prisma.waMessage.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { orderAt: { [gallery ? 'lt' : 'gt']: new Date(cursor.value ?? '') } },
                {
                  orderAt: new Date(cursor.value ?? ''),
                  id: { [gallery ? 'lt' : 'gt']: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ orderAt: gallery ? 'desc' : 'asc' }, { id: gallery ? 'desc' : 'asc' }],
      take: query.limit + 1,
      include: { media: true },
    }),
  ])
  const selected = rows.slice(0, query.limit),
    last = selected.at(-1)
  return {
    status: 'success' as const,
    data: selected.map((message) => {
      if (!message.media) throw new Error('Media relation missing from media query')
      return { ...mediaDTO(message.media), message: messageDTO(message) }
    }),
    count,
    page: {
      hasMore: rows.length > query.limit,
      nextCursor:
        rows.length > query.limit && last
          ? encodeChatCursor(scope, last.id, last.orderAt.toISOString())
          : null,
    },
  }
}
