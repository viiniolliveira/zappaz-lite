import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'
import { mediaResponse } from '../../lib/chat-media-response.ts'
import { editWhatsappTextMessage } from './edit-service.ts'
import { getMessageById, getMessages } from './query-service.ts'

import {
  AudioMessageSchema,
  ContactMessageSchema,
  DocumentMessageSchema,
  EditMessageSchema,
  GetMessageParamsSchema,
  GetMessageQuerySchema,
  GetMessagesQuerySchema,
  ImageMessageSchema,
  LocationMessageSchema,
  MessageParamsSchema,
  SessionParamsSchema,
  TextMessageSchema,
  VideoMessageSchema,
} from './schema.ts'
import {
  deleteMessageForEveryone,
  getMessageMedia,
  getMessageMediaBinary,
  sendAudioMessage,
  sendContactMessage,
  sendDocumentMessage,
  sendImageMessage,
  sendLocationMessage,
  sendTextMessage,
  sendVideoMessage,
} from './service.ts'

export async function getMessagesController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const query = GetMessagesQuerySchema.parse(c.req.query())
  return c.json(await getMessages(sessionId, query))
}

export async function getMessageByIdController(c: Context<AppEnv>) {
  const { sessionId, messageId } = GetMessageParamsSchema.parse(c.req.param())
  const query = GetMessageQuerySchema.parse(c.req.query())
  return c.json({ status: 'success', data: await getMessageById(sessionId, messageId, query) })
}

export async function editTextMessageController(c: Context<AppEnv>) {
  const { sessionId, messageId } = MessageParamsSchema.parse(c.req.param())
  const body = EditMessageSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await editWhatsappTextMessage(sessionId, messageId, body),
  })
}

export async function sendTextMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = TextMessageSchema.parse(await c.req.json())
  const message = await sendTextMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendContactMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = ContactMessageSchema.parse(await c.req.json())
  const message = await sendContactMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendLocationMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = LocationMessageSchema.parse(await c.req.json())
  const message = await sendLocationMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendImageMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = ImageMessageSchema.parse(await c.req.json())
  const message = await sendImageMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendVideoMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = VideoMessageSchema.parse(await c.req.json())
  const message = await sendVideoMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendAudioMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = AudioMessageSchema.parse(await c.req.json())
  const message = await sendAudioMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function sendDocumentMessageController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = DocumentMessageSchema.parse(await c.req.json())
  const message = await sendDocumentMessage(sessionId, body)

  return c.json({ status: 'success', message }, 200)
}

export async function deleteMessageForEveryoneController(c: Context<AppEnv>) {
  const { sessionId, messageId } = MessageParamsSchema.parse(c.req.param())
  const deleted = await deleteMessageForEveryone(sessionId, messageId)

  return c.json({ status: 'success', deleted }, 200)
}

export async function getMessageMediaController(c: Context<AppEnv>) {
  const { sessionId, messageId } = MessageParamsSchema.parse(c.req.param())
  const media = await getMessageMedia(sessionId, messageId)

  return c.json({ status: 'success', data: media }, 200)
}

export async function getMessageMediaBinaryController(c: Context<AppEnv>) {
  const { sessionId, messageId } = MessageParamsSchema.parse(c.req.param())
  return mediaResponse(await getMessageMediaBinary(sessionId, messageId), c.req.header('Range'))
}
