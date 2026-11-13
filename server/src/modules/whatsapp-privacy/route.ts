import { requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireConnectedSession, requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  getPrivacySettingsController,
  updateDefaultDisappearingModeController,
  updateGroupsAddPrivacyController,
  updateLastSeenPrivacyController,
  updateOnlinePrivacyController,
  updateProfilePicturePrivacyController,
  updateReadReceiptsPrivacyController,
  updateStatusPrivacyController,
} from './controller.ts'

const whatsappPrivacyRouter = createRouter()
const basePath = '/api/v1/session/:sessionId/privacy'
const sessionMiddlewares = [
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  requireConnectedSession,
] as const

whatsappPrivacyRouter.get(
  basePath,
  describeApiRoute('GET', '/api/v1/session/:sessionId/privacy'),
  ...sessionMiddlewares,
  getPrivacySettingsController,
)
whatsappPrivacyRouter.put(
  `${basePath}/last-seen`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/last-seen'),
  ...sessionMiddlewares,
  updateLastSeenPrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/online`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/online'),
  ...sessionMiddlewares,
  updateOnlinePrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/profile-picture`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/profile-picture'),
  ...sessionMiddlewares,
  updateProfilePicturePrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/status`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/status'),
  ...sessionMiddlewares,
  updateStatusPrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/read-receipts`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/read-receipts'),
  ...sessionMiddlewares,
  updateReadReceiptsPrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/groups-add`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/groups-add'),
  ...sessionMiddlewares,
  updateGroupsAddPrivacyController,
)
whatsappPrivacyRouter.put(
  `${basePath}/default-disappearing-mode`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/privacy/default-disappearing-mode'),
  ...sessionMiddlewares,
  updateDefaultDisappearingModeController,
)

export default whatsappPrivacyRouter
