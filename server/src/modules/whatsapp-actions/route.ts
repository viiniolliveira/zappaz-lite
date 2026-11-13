import { requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireConnectedSession, requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  blockContactController,
  getAboutController,
  getDisplayPictureController,
  isOnWhatsAppController,
  unblockContactController,
  updateDisplayPictureController,
  updateProfileNameController,
  updateProfileStatusController,
} from './controller.ts'

const whatsappActionsRouter = createRouter()
const basePath = '/api/v1/session/:sessionId'
const sessionMiddlewares = [
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  requireConnectedSession,
] as const

whatsappActionsRouter.get(
  `${basePath}/display-picture`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/display-picture'),
  ...sessionMiddlewares,
  getDisplayPictureController,
)
whatsappActionsRouter.put(
  `${basePath}/display-picture`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/display-picture'),
  ...sessionMiddlewares,
  updateDisplayPictureController,
)
whatsappActionsRouter.put(
  `${basePath}/update-profile-status`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/update-profile-status'),
  ...sessionMiddlewares,
  updateProfileStatusController,
)
whatsappActionsRouter.put(
  `${basePath}/update-profile-name`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/update-profile-name'),
  ...sessionMiddlewares,
  updateProfileNameController,
)
whatsappActionsRouter.get(
  `${basePath}/is-on-whatsapp/:jid`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/is-on-whatsapp/:jid'),
  ...sessionMiddlewares,
  isOnWhatsAppController,
)
whatsappActionsRouter.get(
  `${basePath}/get-about/:jid`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/get-about/:jid'),
  ...sessionMiddlewares,
  getAboutController,
)
whatsappActionsRouter.put(
  `${basePath}/block-contact/:jid`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/block-contact/:jid'),
  ...sessionMiddlewares,
  blockContactController,
)
whatsappActionsRouter.put(
  `${basePath}/unblock-contact/:jid`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/unblock-contact/:jid'),
  ...sessionMiddlewares,
  unblockContactController,
)

export default whatsappActionsRouter
