import { prisma } from '@db/prisma'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { publishAppInvalidation } from '../../lib/app-events.ts'
import { publishChatChange } from '../../lib/chat-events.ts'
import { chatTransaction } from '../../lib/chat-store.ts'
import { getConversation } from '../conversations/service.ts'
import type { SaveLabelInput } from './types.ts'

export function listLabels(sessionId: string) {
  return prisma.waConversationLabel.findMany({
    where: { sessionId },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}

async function publishLabels(sessionId: string) {
  const session = await prisma.waSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { userId: true },
  })
  publishAppInvalidation({ resource: 'conversation-labels', sessionId, ownerId: session.userId })
}

export async function saveLabel(sessionId: string, input: SaveLabelInput, labelId?: string) {
  const label = await chatTransaction(sessionId, async (tx) => {
    if (!labelId) return tx.waConversationLabel.create({ data: { sessionId, ...input } })
    const existing = await tx.waConversationLabel.findFirst({ where: { sessionId, id: labelId } })
    if (!existing) throw new NotFoundError('Etiqueta não encontrada')
    return tx.waConversationLabel.update({ where: { id: labelId }, data: input })
  })
  await publishLabels(sessionId)
  return label
}

export async function deleteLabel(sessionId: string, labelId: string) {
  const conversationIds = await chatTransaction(sessionId, async (tx) => {
    const label = await tx.waConversationLabel.findFirst({ where: { sessionId, id: labelId } })
    if (!label) throw new NotFoundError('Etiqueta não encontrada')
    const links = await tx.waConversationLabelLink.findMany({
      where: { sessionId, labelId },
      select: { conversationId: true },
    })
    const ids = links.map((link) => link.conversationId)
    await tx.waConversationLabel.delete({ where: { id: labelId } })
    await tx.waConversation.updateMany({
      where: { sessionId, id: { in: ids } },
      data: { revision: { increment: 1 } },
    })
    return ids
  })
  await publishLabels(sessionId)
  for (const conversationId of conversationIds) publishChatChange({ sessionId, conversationId })
}

export async function setConversationLabels(
  sessionId: string,
  conversationId: string,
  labelIds: string[],
) {
  await chatTransaction(sessionId, async (tx) => {
    const existing = await tx.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
    })
    if (!existing) throw new NotFoundError('Conversa não encontrada')
    const count = await tx.waConversationLabel.count({ where: { sessionId, id: { in: labelIds } } })
    if (count !== labelIds.length) throw new NotFoundError('Etiqueta não encontrada nesta sessão')
    await tx.waConversationLabelLink.deleteMany({ where: { sessionId, conversationId } })
    if (labelIds.length)
      await tx.waConversationLabelLink.createMany({
        data: labelIds.map((labelId) => ({ sessionId, conversationId, labelId })),
      })
    await tx.waConversation.update({
      where: { id: conversationId },
      data: { revision: { increment: 1 } },
    })
  })
  publishChatChange({ sessionId, conversationId })
  return getConversation(sessionId, conversationId)
}
