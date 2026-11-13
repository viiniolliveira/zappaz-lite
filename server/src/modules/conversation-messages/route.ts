import { bodyLimit } from 'hono/body-limit'
import { AppError } from '../../common/errors/app-error.ts'
import { config } from '../../config.ts'
import { createRouter } from '../../create-app.ts'
import { requireSession, requireSessionAuth } from '../../middleware/auth.ts'
import { rateLimiter } from '../../middleware/rate-limiter.ts'
import { describeApiRoute } from '../docs/openapi.ts'
import {
  deleteMessageController,
  downloadMediaController,
  editMessageController,
  getChatMessageController,
  listMediaController,
  listMessagesController,
  sendMediaController,
  sendTextController,
} from './controller.ts'

const router = createRouter()
const base = '/api/v1/session/:sessionId/conversations/:conversationId'
const guards = [rateLimiter, requireSession, requireSessionAuth] as const
router.get(
  `${base}/messages`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/conversations/:conversationId/messages'),
  ...guards,
  listMessagesController,
)
router.patch(
  `${base}/messages/:messageRecordId`,
  describeApiRoute(
    'PATCH',
    '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
  ),
  ...guards,
  bodyLimit({ maxSize: 512 * 1024 }),
  editMessageController,
)
router.delete(
  `${base}/messages/:messageRecordId`,
  describeApiRoute(
    'DELETE',
    '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
  ),
  ...guards,
  deleteMessageController,
)
router.get(
  `${base}/messages/:messageRecordId`,
  describeApiRoute(
    'GET',
    '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
  ),
  ...guards,
  getChatMessageController,
)
router.get(
  `${base}/media`,
  describeApiRoute('GET', '/api/v1/session/:sessionId/conversations/:conversationId/media'),
  ...guards,
  listMediaController,
)
router.get(
  `${base}/media/:mediaId/content`,
  describeApiRoute(
    'GET',
    '/api/v1/session/:sessionId/conversations/:conversationId/media/:mediaId/content',
  ),
  ...guards,
  downloadMediaController,
)
router.post(
  `${base}/messages/text`,
  describeApiRoute(
    'POST',
    '/api/v1/session/:sessionId/conversations/:conversationId/messages/text',
  ),
  ...guards,
  bodyLimit({
    maxSize: 32768,
    onError: () => {
      throw new AppError({
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large',
      })
    },
  }),
  sendTextController,
)
router.post(
  `${base}/messages/media`,
  describeApiRoute(
    'POST',
    '/api/v1/session/:sessionId/conversations/:conversationId/messages/media',
  ),
  ...guards,
  bodyLimit({
    maxSize: config.mediaMultipartBodyBytes,
    onError: () => {
      throw new AppError({
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Upload body is too large',
      })
    },
  }),
  sendMediaController,
)
export default router
