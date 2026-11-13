import { createRouter } from '../../create-app.ts'
import { authMiddleware } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { requireRole } from '../../middleware/role.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import { getMediaLimitsController } from './controller.ts'

const router = createRouter()
router.get(
  '/api/v1/media/limits',
  describeApiRoute('GET', '/api/v1/media/limits'),
  rateLimiter,
  authMiddleware,
  requireRole(['user', 'admin']),
  getMediaLimitsController,
)
export default router
