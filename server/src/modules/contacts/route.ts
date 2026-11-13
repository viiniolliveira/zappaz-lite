import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import {
  deleteContactController,
  listContactsController,
  refreshContactAvatarController,
  saveContactController,
  saveExistingContactController,
  updateContactController,
} from './controller.ts'

const router = createRouter()
router.post(
  '/api/v1/session/:sessionId/contacts/:contactId/avatar',
  describeApiRoute('POST', '/api/v1/session/:sessionId/contacts/:contactId/avatar'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  refreshContactAvatarController,
)
router.get(
  '/api/v1/session/:sessionId/contacts',
  describeApiRoute('GET', '/api/v1/session/:sessionId/contacts'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  listContactsController,
)
router.post(
  '/api/v1/session/:sessionId/contacts',
  describeApiRoute('POST', '/api/v1/session/:sessionId/contacts'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  saveContactController,
)
router.put(
  '/api/v1/session/:sessionId/contacts/:contactId',
  describeApiRoute('PUT', '/api/v1/session/:sessionId/contacts/:contactId'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  saveExistingContactController,
)
router.patch(
  '/api/v1/session/:sessionId/contacts/:contactId',
  describeApiRoute('PATCH', '/api/v1/session/:sessionId/contacts/:contactId'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  updateContactController,
)
router.delete(
  '/api/v1/session/:sessionId/contacts/:contactId',
  describeApiRoute('DELETE', '/api/v1/session/:sessionId/contacts/:contactId'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  deleteContactController,
)
export default router
