import { authMiddleware, requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireRole } from '@middleware/role.ts'
import { requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  archiveSessionController,
  connectSessionController,
  createSessionController,
  getSessionByIdController,
  getSessionsController,
  logoutSessionController,
  removeSessionController,
  unArchiveSessionController,
  updateSessionController,
} from './controller.ts'

export const adminSessionsRouter = createRouter()

adminSessionsRouter.get(
  '/session',
  describeApiRoute('GET', '/admin/session'),
  authMiddleware,
  requireRole(['admin']),
  getSessionsController,
)
adminSessionsRouter.post(
  '/session',
  describeApiRoute('POST', '/admin/session'),
  authMiddleware,
  requireRole(['admin']),
  createSessionController,
)
adminSessionsRouter.get(
  '/session/:sessionId',
  describeApiRoute('GET', '/admin/session/:sessionId'),
  authMiddleware,
  requireRole(['admin']),
  getSessionByIdController,
)
adminSessionsRouter.put(
  '/session/:sessionId',
  describeApiRoute('PUT', '/admin/session/:sessionId'),
  rateLimiter,
  authMiddleware,
  requireRole(['admin']),
  requireSession,
  updateSessionController,
)
adminSessionsRouter.delete(
  '/session/:sessionId/remove',
  describeApiRoute('DELETE', '/admin/session/:sessionId/remove'),
  rateLimiter,
  authMiddleware,
  requireRole(['admin']),
  requireSession,
  removeSessionController,
)
adminSessionsRouter.put(
  '/session/:sessionId/archive',
  describeApiRoute('PUT', '/admin/session/:sessionId/archive'),
  authMiddleware,
  requireRole(['admin']),
  archiveSessionController,
)
adminSessionsRouter.put(
  '/session/:sessionId/un-archive',
  describeApiRoute('PUT', '/admin/session/:sessionId/un-archive'),
  authMiddleware,
  requireRole(['admin']),
  unArchiveSessionController,
)

export const apiSessionsRouter = createRouter()

apiSessionsRouter.get(
  '/session',
  describeApiRoute('GET', '/api/v1/session'),
  authMiddleware,
  requireRole(['user', 'admin']),
  getSessionsController,
)
apiSessionsRouter.post(
  '/session',
  describeApiRoute('POST', '/api/v1/session'),
  authMiddleware,
  requireRole(['user', 'admin']),
  createSessionController,
)
apiSessionsRouter.get(
  '/session/:sessionId',
  describeApiRoute('GET', '/api/v1/session/:sessionId'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  getSessionByIdController,
)
apiSessionsRouter.put(
  '/session/:sessionId',
  describeApiRoute('PUT', '/api/v1/session/:sessionId'),
  rateLimiter,
  authMiddleware,
  requireRole(['user', 'admin']),
  requireSession,
  requireSessionAuth,
  updateSessionController,
)
apiSessionsRouter.delete(
  '/session/:sessionId/remove',
  describeApiRoute('DELETE', '/api/v1/session/:sessionId/remove'),
  rateLimiter,
  authMiddleware,
  requireRole(['user', 'admin']),
  requireSession,
  requireSessionAuth,
  removeSessionController,
)
apiSessionsRouter.post(
  '/session/:sessionId/connect',
  describeApiRoute('POST', '/api/v1/session/:sessionId/connect'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  connectSessionController,
)
apiSessionsRouter.put(
  '/session/:sessionId/logout',
  describeApiRoute('PUT', '/api/v1/session/:sessionId/logout'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  logoutSessionController,
)

export default apiSessionsRouter
