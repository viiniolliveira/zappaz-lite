import { prisma } from '@db/prisma'
import type { z } from 'zod'
import type { EditMessageSchema } from '../../../../shared/edit-message.ts'
import { AppError } from '../../common/errors/app-error.ts'
import { ForbiddenError } from '../../common/errors/forbidden-error.ts'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import { messageDTO } from '../../lib/chat-dto.ts'
import { findLegacyMessage, updateChatMessage } from '../../lib/chat-store.ts'
import { whatsappService } from '../../services/whatsapp.ts'

export async function editTextMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
  body: z.infer<typeof EditMessageSchema>,
) {
  const message = await prisma.waMessage.findFirst({
    where: { sessionId, conversationId, id: messageRecordId },
    include: { media: true, conversation: true },
  })
  if (!message) throw new NotFoundError('Message not found')
  if (!message.fromMe) throw new ForbiddenError('Only your own messages can be edited')
  const dto = messageDTO(message)
  if (message.type !== 'text' || message.deletedAt || dto.interactive)
    throw new AppError({
      status: 409,
      code: 'MESSAGE_NOT_EDITABLE',
      message: 'Only existing text messages and text replies can be edited',
    })
  if (!whatsappService.isSessionEnabled(sessionId))
    throw new AppError({ status: 409, code: 'SESSION_NOT_ENABLED', message: 'Session is disabled' })
  if (!whatsappService.isSessionConnected(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_CONNECTED',
      message: 'Session is disconnected',
    })
  if (message.text === body.text) return dto
  const key = { id: message.messageId, remoteJid: message.conversation.jid, fromMe: true }
  let result: Awaited<ReturnType<typeof whatsappService.editTextMessage>>
  try {
    result = await whatsappService.editTextMessage(sessionId, key, body.text)
  } catch (cause) {
    throw new AppError({
      status: 502,
      code: 'MESSAGE_EDIT_FAILED',
      message: 'WhatsApp edit could not be confirmed; do not retry automatically',
      cause,
    })
  }
  const edited = result?.message?.protocolMessage?.editedMessage
  if (!result?.key.id || !edited)
    throw new AppError({
      status: 502,
      code: 'MESSAGE_EDIT_FAILED',
      message: 'WhatsApp edit could not be confirmed; do not retry automatically',
    })
  await updateChatMessage(sessionId, key, { message: edited })
  const saved = await prisma.waMessage.findFirst({
    where: { sessionId, conversationId, id: messageRecordId },
    include: { media: true },
  })
  if (!saved) throw new NotFoundError('Message not found')
  return messageDTO(saved)
}

export async function editWhatsappTextMessage(
  sessionId: string,
  messageId: string,
  body: z.infer<typeof EditMessageSchema>,
) {
  const message = await findLegacyMessage(sessionId, messageId)
  if (!message) throw new NotFoundError('Message not found')
  return editTextMessage(sessionId, message.conversationId, message.id, body)
}
