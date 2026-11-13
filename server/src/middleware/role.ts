import { ForbiddenError } from '@server/common/errors/forbidden-error.ts'
import { UnauthorizedError } from '@server/common/errors/unauthorized-error.ts'
import type { AppEnv } from '@server/create-app.ts'
import { createMiddleware } from 'hono/factory'

export function requireRole(roles: readonly ('user' | 'admin')[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    if (!user) throw new UnauthorizedError('Access denied')
    if (!roles.some((role) => role.toUpperCase() === user.role))
      throw new ForbiddenError('Access denied')
    await next()
  })
}
