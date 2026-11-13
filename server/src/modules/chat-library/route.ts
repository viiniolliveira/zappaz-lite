import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import { listLibraryController } from './controller.ts'

const router = createRouter()
const path = '/api/v1/session/:sessionId/library'
router.get(
  path,
  describeApiRoute('GET', path),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  listLibraryController,
)
export default router
