import { requireSession, requireSessionAuth } from '@middleware/auth'
import { rateLimiter } from '@middleware/rate-limiter'
import { requireConnectedSession, requireEnabledSession } from '@middleware/session'
import { createRouter } from '@server/create-app'
import { bodyLimit } from 'hono/body-limit'
import { describeApiRoute } from '../docs/openapi.ts'

import {
  deleteMessageForEveryoneController,
  editTextMessageController,
  getMessageByIdController,
  getMessageMediaBinaryController,
  getMessageMediaController,
  getMessagesController,
  sendAudioMessageController,
  sendContactMessageController,
  sendDocumentMessageController,
  sendImageMessageController,
  sendLocationMessageController,
  sendTextMessageController,
  sendVideoMessageController,
} from './controller.ts'

const whatsappMessagesRouter = createRouter()
const basePath = '/api/v1/session/:sessionId/message'
const queryGuards = [rateLimiter, requireSession, requireSessionAuth] as const
whatsappMessagesRouter.get(
  '/api/v1/session/:sessionId/messages',
  describeApiRoute('GET', '/api/v1/session/:sessionId/messages'),
  ...queryGuards,
  getMessagesController,
)
whatsappMessagesRouter.get(
  '/api/v1/session/:sessionId/messages/:messageId',
  describeApiRoute('GET', '/api/v1/session/:sessionId/messages/:messageId'),
  ...queryGuards,
  getMessageByIdController,
)
const sessionMiddlewares = [
  rateLimiter,
  requireSession,
  requireSessionAuth,
  requireEnabledSession,
  requireConnectedSession,
] as const

whatsappMessagesRouter.post(
  `${basePath}/text`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/text'),
  ...sessionMiddlewares,
  sendTextMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/image`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/image'),
  ...sessionMiddlewares,
  sendImageMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/video`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/video'),
  ...sessionMiddlewares,
  sendVideoMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/audio`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/audio'),
  ...sessionMiddlewares,
  sendAudioMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/document`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/document'),
  ...sessionMiddlewares,
  sendDocumentMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/contact`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/contact'),
  ...sessionMiddlewares,
  sendContactMessageController,
)
whatsappMessagesRouter.post(
  `${basePath}/location`,
  describeApiRoute('POST', '/api/v1/session/:sessionId/message/location'),
  ...sessionMiddlewares,
  sendLocationMessageController,
)
whatsappMessagesRouter.patch(
  `${basePath}/:messageId`,
  describeApiRoute('PATCH', '/api/v1/session/:sessionId/message/:messageId'),
  ...sessionMiddlewares,
  bodyLimit({ maxSize: 512 * 1024 }),
  editTextMessageController,
)
whatsappMessagesRouter.delete(
  `${basePath}/:messageId`,
  describeApiRoute('DELETE', '/api/v1/session/:sessionId/message/:messageId'),
  ...sessionMiddlewares,
  deleteMessageForEveryoneController,
)
whatsappMessagesRouter.get(
  `${basePath}/:messageId/media/base64`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/message/:messageId/media/base64'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  getMessageMediaController,
)
whatsappMessagesRouter.get(
  `${basePath}/:messageId/media/binary`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/message/:messageId/media/binary'),
  rateLimiter,
  requireSession,
  requireSessionAuth,
  getMessageMediaBinaryController,
)

export default whatsappMessagesRouter
