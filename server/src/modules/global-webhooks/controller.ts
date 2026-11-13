import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  CreateGlobalWebhookBodySchema,
  GlobalWebhookParamsSchema,
  UpdateGlobalWebhookBodySchema,
} from './schema.ts'
import {
  createGlobalWebhook,
  getGlobalWebhooks,
  removeGlobalWebhook,
  updateGlobalWebhook,
} from './service.ts'

export async function getGlobalWebhooksController(c: Context<AppEnv>) {
  const webhooks = await getGlobalWebhooks()

  return c.json(webhooks, 200)
}

export async function createGlobalWebhookController(c: Context<AppEnv>) {
  const data = CreateGlobalWebhookBodySchema.parse(await c.req.json())
  const webhook = await createGlobalWebhook(data)

  return c.json({ status: 'success', data: webhook }, 201)
}

export async function updateGlobalWebhookController(c: Context<AppEnv>) {
  const { webhookId } = GlobalWebhookParamsSchema.parse(c.req.param())
  const data = UpdateGlobalWebhookBodySchema.parse(await c.req.json())
  const webhook = await updateGlobalWebhook(webhookId, data)

  return c.json({ status: 'success', data: webhook }, 200)
}

export async function removeGlobalWebhookController(c: Context<AppEnv>) {
  const { webhookId } = GlobalWebhookParamsSchema.parse(c.req.param())
  await removeGlobalWebhook(webhookId)

  return c.json({ status: 'success', message: 'Global webhook deleted' }, 200)
}
