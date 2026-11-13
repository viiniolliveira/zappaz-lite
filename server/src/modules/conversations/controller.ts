import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import {
  ConversationParamsSchema,
  ConversationQuerySchema,
  ConversationReadStateSchema,
  CreateConversationSchema,
  ReadConversationSchema,
} from './schema.ts'
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  readConversation,
  setConversationReadState,
} from './service.ts'
export async function listConversationsController(c: Context<AppEnv>) {
  return c.json(
    await listConversations(
      c.req.param('sessionId') ?? '',
      ConversationQuerySchema.parse(c.req.query()),
    ),
  )
}
export async function getConversationController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = ConversationParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await getConversation(sessionId, conversationId),
  })
}
export async function createConversationController(c: Context<AppEnv>) {
  const input = CreateConversationSchema.parse(await c.req.json())
  const result = await createConversation(c.req.param('sessionId') ?? '', input)
  return c.json({ status: 'success', data: result.data }, result.created ? 201 : 200)
}
export async function readConversationController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = ConversationParamsSchema.parse(c.req.param())
  const body = ReadConversationSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await readConversation(sessionId, conversationId, body.lastReadMessageRecordId),
  })
}
export async function deleteConversationController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = ConversationParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await deleteConversation(sessionId, conversationId),
  })
}
export async function setConversationReadStateController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = ConversationParamsSchema.parse(c.req.param())
  const { read } = ConversationReadStateSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await setConversationReadState(sessionId, conversationId, read),
  })
}
