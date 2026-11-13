import { requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireConnectedSession, requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  createGroupController,
  getInviteCodeController,
  leaveGroupController,
  listGroupsController,
  revokeInviteCodeController,
  sendInviteController,
  updateGroupController,
  updateGroupParticipantsController,
} from './controller.ts'

const whatsappGroupsRouter = createRouter()
const basePath = '/api/v1/session/:sessionId/group'
const sessionMiddlewares = [
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  requireConnectedSession,
] as const

whatsappGroupsRouter.get(
  basePath,
  describeApiRoute('GET', '/api/v1/session/:sessionId/group'),
  ...sessionMiddlewares,
  listGroupsController,
)
whatsappGroupsRouter.post(
  basePath,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group'),
  ...sessionMiddlewares,
  createGroupController,
)
whatsappGroupsRouter.put(
  `${basePath}/:jid`,
  describeApiRoute('PUT', '/api/v1/session/:sessionId/group/:jid'),
  ...sessionMiddlewares,
  updateGroupController,
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/send-invite`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/send-invite'),
  ...sessionMiddlewares,
  sendInviteController,
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/add`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/add'),
  ...sessionMiddlewares,
  updateGroupParticipantsController('add'),
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/remove`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/remove'),
  ...sessionMiddlewares,
  updateGroupParticipantsController('remove'),
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/promote`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/promote'),
  ...sessionMiddlewares,
  updateGroupParticipantsController('promote'),
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/demote`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/demote'),
  ...sessionMiddlewares,
  updateGroupParticipantsController('demote'),
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/invite-code`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/invite-code'),
  ...sessionMiddlewares,
  getInviteCodeController,
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/invite-code-revoke`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/invite-code-revoke'),
  ...sessionMiddlewares,
  revokeInviteCodeController,
)
whatsappGroupsRouter.post(
  `${basePath}/:jid/leave`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/group/:jid/leave'),
  ...sessionMiddlewares,
  leaveGroupController,
)

export default whatsappGroupsRouter
