import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import {
  createQuickMessageController,
  deleteQuickMessageController,
  listQuickMessagesController,
  updateQuickMessageController,
} from './controller.ts'

const router = createRouter()
const base = '/api/v1/session/:sessionId/quick-messages'
const guards = [rateLimiter, requireSession, requireSessionAuth] as const
router.get(base, describeApiRoute('GET', base), ...guards, listQuickMessagesController)
router.post(base, describeApiRoute('POST', base), ...guards, createQuickMessageController)
router.patch(
  `${base}/:quickMessageId`,
  describeApiRoute('PATCH', `${base}/:quickMessageId`),
  ...guards,
  updateQuickMessageController,
)
router.delete(
  `${base}/:quickMessageId`,
  describeApiRoute('DELETE', `${base}/:quickMessageId`),
  ...guards,
  deleteQuickMessageController,
)
export default router
