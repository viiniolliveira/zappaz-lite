import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  CreateWebhookBodySchema,
  GetWebhookLogsQuerySchema,
  GetWebhooksQuerySchema,
  SessionParamsSchema,
  UpdateWebhookBodySchema,
  WebhookLogParamsSchema,
  WebhookParamsSchema,
} from './schema.ts'
import {
  createWebhook,
  getWebhookById,
  getWebhookLogById,
  getWebhookLogs,
  getWebhooks,
  removeWebhook,
  retryWebhookLog,
  updateWebhook,
} from './service.ts'

export async function getWebhooksController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const query = GetWebhooksQuerySchema.parse(c.req.query())
  const result = await getWebhooks(sessionId, query)

  return c.json({ status: 'success', ...result }, 200)
}

export async function getWebhookByIdController(c: Context<AppEnv>) {
  const { sessionId, webhookId } = WebhookParamsSchema.parse(c.req.param())
  const webhook = await getWebhookById(sessionId, webhookId)

  return c.json({ status: 'success', data: webhook }, 200)
}

export async function createWebhookController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const data = CreateWebhookBodySchema.parse(await c.req.json())
  const webhook = await createWebhook(sessionId, data)

  return c.json({ status: 'success', data: webhook }, 201)
}

export async function updateWebhookController(c: Context<AppEnv>) {
  const { sessionId, webhookId } = WebhookParamsSchema.parse(c.req.param())
  const data = UpdateWebhookBodySchema.parse(await c.req.json())
  const webhook = await updateWebhook(sessionId, webhookId, data)

  return c.json({ status: 'success', data: webhook }, 200)
}

export async function removeWebhookController(c: Context<AppEnv>) {
  const { sessionId, webhookId } = WebhookParamsSchema.parse(c.req.param())
  await removeWebhook(sessionId, webhookId)

  return c.json({ status: 'success', message: 'Webhook deleted' }, 200)
}

export async function getWebhookLogByIdController(c: Context<AppEnv>) {
  const params = WebhookLogParamsSchema.parse(c.req.param())
  const log = await getWebhookLogById(params.sessionId, params.webhookId, params.logId)

  return c.json(log, 200)
}

export async function getWebhookLogsController(c: Context<AppEnv>) {
  const { sessionId, webhookId } = WebhookParamsSchema.parse(c.req.param())
  const query = GetWebhookLogsQuerySchema.parse(c.req.query())
  const result = await getWebhookLogs(sessionId, webhookId, query)

  return c.json({ status: 'success', ...result }, 200)
}

export async function retryWebhookLogController(c: Context<AppEnv>) {
  const params = WebhookLogParamsSchema.parse(c.req.param())
  const log = await retryWebhookLog(params)

  return c.json({ status: 'success', data: log }, 200)
}
