import { prisma } from '@db/prisma'
import { Prisma } from '@generated/prisma'
import { ConflictError } from '../../common/errors/conflict-error.ts'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { publishAppInvalidation } from '../../lib/app-events.ts'
import type { SaveQuickMessageInput } from './types.ts'

export function listQuickMessages(sessionId: string) {
  return prisma.waQuickMessage.findMany({
    where: { sessionId },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  })
}

async function publishQuickMessages(sessionId: string) {
  const session = await prisma.waSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { userId: true },
  })
  publishAppInvalidation({ resource: 'quick-messages', sessionId, ownerId: session.userId })
}

export async function saveQuickMessage(
  sessionId: string,
  input: SaveQuickMessageInput,
  quickMessageId?: string,
) {
  try {
    const message = quickMessageId
      ? (
          await prisma.waQuickMessage.updateManyAndReturn({
            where: { sessionId, id: quickMessageId },
            data: input,
          })
        )[0]
      : await prisma.waQuickMessage.create({ data: { sessionId, ...input } })
    if (!message) throw new NotFoundError('Mensagem rápida não encontrada')
    await publishQuickMessages(sessionId)
    return message
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictError('Já existe uma mensagem rápida com este comando nesta sessão.', error)
    throw error
  }
}

export async function deleteQuickMessage(sessionId: string, quickMessageId: string) {
  const result = await prisma.waQuickMessage.deleteMany({
    where: { sessionId, id: quickMessageId },
  })
  if (!result.count) throw new NotFoundError('Mensagem rápida não encontrada')
  await publishQuickMessages(sessionId)
}
