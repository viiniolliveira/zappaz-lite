import { requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  createWebhookController,
  getWebhookByIdController,
  getWebhookLogByIdController,
  getWebhookLogsController,
  getWebhooksController,
  removeWebhookController,
  retryWebhookLogController,
  updateWebhookController,
} from './controller.ts'

const webhooksRouter = createRouter()
const basePath = '/api/v1/session/:sessionId'

const webhookMiddlewares = [
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
] as const

webhooksRouter.get(
  `${basePath}/webhook`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/webhook'),
  ...webhookMiddlewares,
  getWebhooksController,
)
webhooksRouter.post(
  `${basePath}/webhook`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/webhook'),
  ...webhookMiddlewares,
  createWebhookController,
)
webhooksRouter.get(
  `${basePath}/webhook/:webhookId`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/webhook/:webhookId'),
  ...webhookMiddlewares,
  getWebhookByIdController,
)
webhooksRouter.put(
  `${basePath}/webhook/:webhookId`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/webhook/:webhookId'),
  ...webhookMiddlewares,
  updateWebhookController,
)
webhooksRouter.delete(
  `${basePath}/webhook/:webhookId`,
  describeApiRoute('DELETE', '/api/v1/session/:sessionId/webhook/:webhookId'),
  ...webhookMiddlewares,
  removeWebhookController,
)
webhooksRouter.get(
  `${basePath}/webhook/:webhookId/logs`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/webhook/:webhookId/logs'),
  ...webhookMiddlewares,
  getWebhookLogsController,
)
webhooksRouter.get(
  `${basePath}/webhook/:webhookId/logs/:logId`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/webhook/:webhookId/logs/:logId'),
  ...webhookMiddlewares,
  getWebhookLogByIdController,
)
webhooksRouter.post(
  `${basePath}/webhook/:webhookId/logs/:logId/retry`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/webhook/:webhookId/logs/:logId/retry'),
  ...webhookMiddlewares,
  retryWebhookLogController,
)

export default webhooksRouter
