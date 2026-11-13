import { prisma } from '@db/prisma'
import type { Prisma } from '@generated/prisma'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { messageDTO } from '../../lib/chat-dto.ts'
import { conversationIdentityWhere } from '../../lib/chat-identity.ts'
import { listMessagePage } from '../conversation-messages/service.ts'
import type { GetMessagesQuery, MessageFilters } from './types.ts'

function messageScope(sessionId: string, filters: MessageFilters): Prisma.WaMessageWhereInput {
  const identities = [
    ...(filters.phoneNumber ? [`${filters.phoneNumber}@s.whatsapp.net`] : []),
    ...(filters.lid ? [filters.lid] : []),
    ...(filters.jid ? [filters.jid] : []),
  ]
  return {
    sessionId,
    ...(filters.conversationId ? { conversationId: filters.conversationId } : {}),
    conversation: {
      sessionId,
      isGroup: false,
      AND: identities.map(conversationIdentityWhere),
    },
  }
}

export async function getMessages(sessionId: string, query: GetMessagesQuery) {
  const scope = JSON.stringify([
    'session-messages',
    sessionId,
    query.conversationId ?? null,
    query.phoneNumber ?? null,
    query.lid ?? null,
    query.jid ?? null,
  ])
  return listMessagePage(messageScope(sessionId, query), scope, query)
}

export async function getMessageById(
  sessionId: string,
  messageId: string,
  filters: MessageFilters,
) {
  const message = await prisma.waMessage.findFirst({
    where: { ...messageScope(sessionId, filters), messageId },
    include: { media: true },
  })
  if (!message) throw new NotFoundError('Message not found')
  return messageDTO(message)
}
