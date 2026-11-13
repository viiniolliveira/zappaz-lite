import { authMiddleware } from '@middleware/auth'
import { requireRole } from '@middleware/role.ts'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  createGlobalWebhookController,
  getGlobalWebhooksController,
  removeGlobalWebhookController,
  updateGlobalWebhookController,
} from './controller.ts'

const globalWebhooksRouter = createRouter()

globalWebhooksRouter.get(
  '/webhook',
  describeApiRoute('GET', '/admin/webhook'),
  authMiddleware,
  requireRole(['admin']),
  getGlobalWebhooksController,
)
globalWebhooksRouter.post(
  '/webhook',
  describeApiRoute('POST', '/admin/webhook'),
  authMiddleware,
  requireRole(['admin']),
  createGlobalWebhookController,
)
globalWebhooksRouter.put(
  '/webhook/:webhookId',
  describeApiRoute('PUT', '/admin/webhook/:webhookId'),
  authMiddleware,
  requireRole(['admin']),
  updateGlobalWebhookController,
)
globalWebhooksRouter.delete(
  '/webhook/:webhookId',
  describeApiRoute('DELETE', '/admin/webhook/:webhookId'),
  authMiddleware,
  requireRole(['admin']),
  removeGlobalWebhookController,
)

export default globalWebhooksRouter
