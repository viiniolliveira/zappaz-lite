import { prisma } from '@db/prisma'
import type { AnyMessageContent } from 'baileys'
import { fileTypeFromBuffer } from 'file-type'
import type { z } from 'zod'
import { AppError } from '../../common/errors/app-error.ts'
import { NotFoundError } from '../../common/errors/not-found-error.ts'
import type { TextSignature } from '../../common/schema.ts'
import { config } from '../../config.ts'
import { findLegacyMessage, updateChatMessage } from '../../lib/chat-store.ts'
import { whatsappService } from '../../services/whatsapp.ts'
import type { SendMediaSchema } from './schema.ts'
import { getChatMessage } from './service.ts'
import type { SendText } from './types.ts'
import { encodeVoiceAudio } from './voice-audio.ts'

async function sendContext(sessionId: string, conversationId: string, replyId?: string | null) {
  const conversation = await prisma.waConversation.findFirst({
    where: { sessionId, id: conversationId, isGroup: false },
  })
  if (!conversation) throw new NotFoundError('Conversation not found')
  if (!whatsappService.isSessionEnabled(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_ENABLED',
      message: 'Session is disabled',
    })
  if (!whatsappService.isSessionConnected(sessionId))
    throw new AppError({
      status: 409,
      code: 'SESSION_NOT_CONNECTED',
      message: 'Session is disconnected',
    })
  const reply = replyId
    ? await prisma.waMessage.findFirst({
        where: { sessionId, conversationId, id: replyId, deletedAt: null },
      })
    : null
  if (replyId && !reply) throw new NotFoundError('Quoted message not found')
  return { jid: conversation.jid, quoted: reply?.messageId }
}
async function send(
  sessionId: string,
  conversationId: string,
  body: { clientRequestId: string; replyToMessageRecordId?: string | null },
  content: AnyMessageContent,
  type: 'text' | 'image' | 'video' | 'audio' | 'document',
  signature?: TextSignature,
) {
  const { jid, quoted } = await sendContext(sessionId, conversationId, body.replyToMessageRecordId)
  const result = await whatsappService.sendChatMessage(
    sessionId,
    jid,
    content,
    type,
    body.clientRequestId,
    quoted,
    signature,
  )
  if (!result?.key.id)
    throw new AppError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Send result is uncertain; do not retry automatically',
    })
  const saved = await findLegacyMessage(sessionId, result.key.id, jid)
  if (!saved)
    throw new AppError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Sent message could not be confirmed in storage',
    })
  return getChatMessage(sessionId, conversationId, saved.id)
}
export async function sendChatText(sessionId: string, conversationId: string, body: SendText) {
  return send(
    sessionId,
    conversationId,
    body,
    { text: body.text, linkPreview: undefined },
    'text',
    body,
  )
}

export async function deleteChatMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
) {
  const { jid } = await sendContext(sessionId, conversationId)
  const message = await getChatMessage(sessionId, conversationId, messageRecordId)
  if (!message.fromMe)
    throw new AppError({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Only your own messages can be deleted for everyone',
    })
  if (message.deletedAt) return message
  const key = { id: message.messageId, remoteJid: jid, fromMe: true }
  const result = await whatsappService.deleteMessageForEveryone(sessionId, message.messageId, key)
  if (!result?.key.id)
    throw new AppError({
      status: 502,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'WhatsApp deletion could not be confirmed',
    })
  await updateChatMessage(sessionId, key, { deleted: true })
  return getChatMessage(sessionId, conversationId, messageRecordId)
}
export async function sendChatMedia(
  sessionId: string,
  conversationId: string,
  body: z.infer<typeof SendMediaSchema>,
) {
  if (body.file.size > config.mediaMaxFileSizeBytes)
    throw new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `File exceeds ${config.mediaMaxFileSizeMb} MiB`,
    })
  if (body.file.size === 0)
    throw new AppError({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'File is empty',
    })
  let bytes: Buffer = Buffer.from(await body.file.arrayBuffer())
  const detected = await fileTypeFromBuffer(bytes)
  let mimetype = detected?.mime ?? 'application/octet-stream'
  const browserAudioContainer =
    body.voice === 'true' &&
    body.kind === 'audio' &&
    (mimetype === 'video/webm' || mimetype === 'video/mp4')
  if (body.kind !== 'document' && !mimetype.startsWith(`${body.kind}/`) && !browserAudioContainer)
    throw new AppError({
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'File bytes do not match media kind',
    })
  if (body.voice === 'true') {
    bytes = await encodeVoiceAudio(bytes)
    mimetype = 'audio/mpeg'
  }
  const fileName = body.file.name.split(/[\\/]/).at(-1)?.slice(0, 200) || 'file'
  let content: AnyMessageContent
  switch (body.kind) {
    case 'image':
      content = { image: bytes, mimetype, caption: body.caption }
      break
    case 'video':
      content = { video: bytes, mimetype, caption: body.caption }
      break
    case 'audio':
      content = { audio: bytes, mimetype, ptt: false }
      break
    default:
      content = { document: bytes, mimetype, fileName, caption: body.caption }
  }
  return send(sessionId, conversationId, body, content, body.kind)
}
