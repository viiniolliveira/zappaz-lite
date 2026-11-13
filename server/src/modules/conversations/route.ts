import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import {
  createConversationController,
  deleteConversationController,
  getConversationController,
  listConversationsController,
  readConversationController,
  setConversationReadStateController,
} from './controller.ts'

const router = createRouter()
const base = '/api/v1/session/:sessionId/conversations'
const guards = [rateLimiter, requireSession, requireSessionAuth] as const
router.get(
  base,
  describeApiRoute('GET', '/api/v1/session/:sessionId/conversations'),
  ...guards,
  listConversationsController,
)
router.post(
  base,
  describeApiRoute('POST', '/api/v1/session/:sessionId/conversations'),
  ...guards,
  createConversationController,
)
router.get(
  `${base}/:conversationId`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/conversations/:conversationId'),
  ...guards,
  getConversationController,
)
router.delete(
  `${base}/:conversationId`,
  describeApiRoute('DELETE', '/api/v1/session/:sessionId/conversations/:conversationId'),
  ...guards,
  deleteConversationController,
)
router.post(
  `${base}/:conversationId/read`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/conversations/:conversationId/read'),
  ...guards,
  readConversationController,
)
router.patch(
  `${base}/:conversationId/read-state`,
  describeApiRoute('PATCH', '/api/v1/session/:sessionId/conversations/:conversationId/read-state'),
  ...guards,
  setConversationReadStateController,
)
export default router
