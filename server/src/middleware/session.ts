import { BadRequestError } from '@server/common/errors/bad-request-error'
import type { AppEnv } from '@server/create-app'
import { whatsappService } from '@services/whatsapp'
import { createMiddleware } from 'hono/factory'

export const requireEnabledSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get('session')
  if (!session?.enabled) {
    throw new BadRequestError('Session not enabled')
  }
  await next()
})

export const requireConnectedSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get('session')
  if (!(session && whatsappService.isSessionConnected(session.id))) {
    throw new BadRequestError('Session not connected')
  }
  await next()
})
