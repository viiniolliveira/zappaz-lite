import { prisma } from '@db/prisma'
import { publishChatChange } from './chat-events.ts'
import { chatTransaction } from './chat-store.ts'

export async function pruneChatMessages(cutoff: Date, onlySessionId?: string) {
  const sessions = await prisma.waMessage.findMany({
    where: { createdAt: { lte: cutoff }, sessionId: onlySessionId },
    distinct: ['sessionId'],
    select: { sessionId: true },
  })
  let removed = 0
  for (const { sessionId } of sessions) {
    const result = await chatTransaction(sessionId, async (tx) => {
      const affected = await tx.waMessage.findMany({
        where: { sessionId, createdAt: { lte: cutoff } },
        distinct: ['conversationId'],
        select: { conversationId: true },
      })
      const deletion = await tx.waMessage.deleteMany({
        where: { sessionId, createdAt: { lte: cutoff } },
      })
      for (const { conversationId } of affected) {
        const conversation = await tx.waConversation.findUniqueOrThrow({
          where: { id: conversationId },
        })
        const latest = await tx.waMessage.findFirst({
          where: { sessionId, conversationId },
          orderBy: [{ orderAt: 'desc' }, { id: 'desc' }],
        })
        const unreadCount = await tx.waMessage.count({
          where: {
            sessionId,
            conversationId,
            fromMe: false,
            content: { path: ['liveReceived'], equals: true },
            ...(conversation.lastReadOrderAt
              ? {
                  OR: [
                    { orderAt: { gt: conversation.lastReadOrderAt } },
                    {
                      orderAt: conversation.lastReadOrderAt,
                      id: { gt: conversation.lastReadMessageId ?? '' },
                    },
                  ],
                }
              : {}),
          },
        })
        await tx.waConversation.update({
          where: { id: conversationId },
          data: {
            lastMessageId: latest?.id ?? null,
            lastActivityAt: latest?.orderAt ?? null,
            unreadCount,
            revision: { increment: 1 },
          },
        })
      }
      return { count: deletion.count, affected }
    })
    removed += result.count
    for (const { conversationId } of result.affected)
      publishChatChange({ sessionId, conversationId, messagesPruned: true })
  }
  return { count: removed }
}
