import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import {
  createLabelController,
  deleteLabelController,
  listLabelsController,
  setConversationLabelsController,
  updateLabelController,
} from './controller.ts'

const router = createRouter()
const base = '/api/v1/session/:sessionId/conversation-labels'
const guards = [rateLimiter, requireSession, requireSessionAuth] as const
router.get(base, describeApiRoute('GET', base), ...guards, listLabelsController)
router.post(base, describeApiRoute('POST', base), ...guards, createLabelController)
router.patch(
  `${base}/:labelId`,
  describeApiRoute('PATCH', `${base}/:labelId`),
  ...guards,
  updateLabelController,
)
router.delete(
  `${base}/:labelId`,
  describeApiRoute('DELETE', `${base}/:labelId`),
  ...guards,
  deleteLabelController,
)
router.put(
  '/api/v1/session/:sessionId/conversations/:conversationId/labels',
  describeApiRoute('PUT', '/api/v1/session/:sessionId/conversations/:conversationId/labels'),
  ...guards,
  setConversationLabelsController,
)
export default router
