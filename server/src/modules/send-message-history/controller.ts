import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import { GetSendMessageHistoryQuerySchema, SendMessageHistoryParamsSchema } from './schema.ts'
import { getSendMessageHistory } from './service.ts'

export async function getSendMessageHistoryController(c: Context<AppEnv>) {
  const { sessionId } = SendMessageHistoryParamsSchema.parse(c.req.param())
  const query = GetSendMessageHistoryQuerySchema.parse(c.req.query())
  const history = await getSendMessageHistory(sessionId, query)

  return c.json(history, 200)
}
