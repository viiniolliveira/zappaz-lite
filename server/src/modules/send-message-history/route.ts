import { authMiddleware, requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireRole } from '@middleware/role.ts'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import { getSendMessageHistoryController } from './controller.ts'

const sendMessageHistoryRouter = createRouter()
export const apiSendMessageHistoryRouter = createRouter()

apiSendMessageHistoryRouter.get(
  '/session/:sessionId/send-message-history',
  describeApiRoute('GET', '/api/v1/session/:sessionId/send-message-history'),
  rateLimiter,
  authMiddleware,
  requireRole(['user', 'admin']),
  requireSession,
  requireSessionAuth,
  getSendMessageHistoryController,
)

sendMessageHistoryRouter.get(
  '/session/:sessionId/send-message-history',
  describeApiRoute('GET', '/admin/session/:sessionId/send-message-history'),
  authMiddleware,
  requireRole(['admin']),
  getSendMessageHistoryController,
)

export default sendMessageHistoryRouter
