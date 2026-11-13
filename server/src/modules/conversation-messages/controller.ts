import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import { retrieveChatMedia } from '../../lib/chat-media.ts'
import { mediaResponse } from '../../lib/chat-media-response.ts'
import { editTextMessage } from '../whatsapp-messages/edit-service.ts'
import {
  EditMessageSchema,
  MediaQuerySchema,
  MessageParamsSchema,
  MessageQuerySchema,
  SendMediaSchema,
  SendTextSchema,
} from './schema.ts'
import { deleteChatMessage, sendChatMedia, sendChatText } from './send-service.ts'
import { getChatMessage, listMedia, listMessages } from './service.ts'
export async function editMessageController(c: Context<AppEnv>) {
  const { sessionId, conversationId, messageRecordId } = MessageParamsSchema.parse(c.req.param())
  const body = EditMessageSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await editTextMessage(sessionId, conversationId, messageRecordId ?? '', body),
  })
}

export async function deleteMessageController(c: Context<AppEnv>) {
  const { sessionId, conversationId, messageRecordId } = MessageParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await deleteChatMessage(sessionId, conversationId, messageRecordId ?? ''),
  })
}
export async function listMessagesController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = MessageParamsSchema.parse(c.req.param())
  return c.json(
    await listMessages(sessionId, conversationId, MessageQuerySchema.parse(c.req.query())),
  )
}
export async function getChatMessageController(c: Context<AppEnv>) {
  const { sessionId, conversationId, messageRecordId } = MessageParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await getChatMessage(sessionId, conversationId, messageRecordId ?? ''),
  })
}
export async function listMediaController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = MessageParamsSchema.parse(c.req.param())
  return c.json(await listMedia(sessionId, conversationId, MediaQuerySchema.parse(c.req.query())))
}
export async function downloadMediaController(c: Context<AppEnv>) {
  const { sessionId, conversationId, mediaId } = MessageParamsSchema.parse(c.req.param())
  return mediaResponse(
    await retrieveChatMedia(sessionId, conversationId, mediaId ?? ''),
    c.req.header('Range'),
  )
}
export async function sendTextController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = MessageParamsSchema.parse(c.req.param())
  return c.json(
    {
      status: 'success',
      data: await sendChatText(sessionId, conversationId, SendTextSchema.parse(await c.req.json())),
    },
    201,
  )
}
export async function sendMediaController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = MessageParamsSchema.parse(c.req.param())
  return c.json(
    {
      status: 'success',
      data: await sendChatMedia(
        sessionId,
        conversationId,
        SendMediaSchema.parse(await c.req.parseBody({ all: true })),
      ),
    },
    201,
  )
}
