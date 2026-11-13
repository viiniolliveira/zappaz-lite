import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import {
  QuickMessageParamsSchema,
  QuickMessageSessionSchema,
  SaveQuickMessageSchema,
} from './schema.ts'
import { deleteQuickMessage, listQuickMessages, saveQuickMessage } from './service.ts'

export async function listQuickMessagesController(c: Context<AppEnv>) {
  const { sessionId } = QuickMessageSessionSchema.parse(c.req.param())
  return c.json({ status: 'success', data: await listQuickMessages(sessionId) })
}
export async function createQuickMessageController(c: Context<AppEnv>) {
  const { sessionId } = QuickMessageSessionSchema.parse(c.req.param())
  const input = SaveQuickMessageSchema.parse(await c.req.json())
  return c.json({ status: 'success', data: await saveQuickMessage(sessionId, input) }, 201)
}
export async function updateQuickMessageController(c: Context<AppEnv>) {
  const { sessionId, quickMessageId } = QuickMessageParamsSchema.parse(c.req.param())
  const input = SaveQuickMessageSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await saveQuickMessage(sessionId, input, quickMessageId),
  })
}
export async function deleteQuickMessageController(c: Context<AppEnv>) {
  const { sessionId, quickMessageId } = QuickMessageParamsSchema.parse(c.req.param())
  await deleteQuickMessage(sessionId, quickMessageId)
  return c.json({ status: 'success', data: { quickMessageId } })
}
