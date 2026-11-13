import type { WaSession } from '@generated/prisma'
import { BadRequestError } from '@server/common/errors/bad-request-error.ts'
import { ForbiddenError } from '@server/common/errors/forbidden-error.ts'
import { RateLimitedError } from '@server/common/errors/rate-limited-error.ts'
import { UnauthorizedError } from '@server/common/errors/unauthorized-error'
import { config } from '@server/config.ts'
import type { AppEnv } from '@server/create-app'
import { prisma } from '@server/db/prisma'
import {
  type AuthUser,
  canAccessSession,
  parseApiKeyPermissions,
} from '@server/lib/api-key-scope.ts'
import { runWithRealtimeOrigin } from '@server/lib/app-events.ts'
import { allowedAppOrigins } from '@server/lib/app-url.ts'
import { auth } from '@server/lib/auth.ts'

function requireTrustedOrigin(request: Request) {
  // Only called after authentication: explicit API credentials do not use browser cookies.
  if (request.headers.has('x-api-key')) return
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  if (!(origin && allowedAppOrigins(config.appUrl, config.isProduction).includes(origin)))
    throw new ForbiddenError('Untrusted request origin')
}

import { createMiddleware } from 'hono/factory'

export async function requestUser(headers: Headers): Promise<AuthUser | null> {
  if (headers.has('x-api-key')) {
    const key = headers.get('x-api-key') ?? ''
    if (!key || key.length > 1024) throw new UnauthorizedError('Invalid API key')
    const result = await auth.api.verifyApiKey({ body: { key } })
    if (!result.valid || !result.key) {
      if (result.error?.code === 'RATE_LIMITED')
        throw new RateLimitedError('API key rate limit exceeded')
      throw new UnauthorizedError('Invalid or expired API key')
    }
    const user = await prisma.user.findUnique({ where: { id: result.key.referenceId } })
    if (!user || user.banned) throw new UnauthorizedError('Access denied')
    const apiKeyScope = parseApiKeyPermissions(result.key.permissions)
    if (!apiKeyScope) throw new UnauthorizedError('Invalid API key scope')
    return { ...user, apiKeyScope }
  }
  const current = await auth.api.getSession({ headers })
  if (!current) return null
  const user = await prisma.user.findUnique({ where: { id: current.user.id } })
  return user && !user.banned ? user : null
}

export async function authorizeSession(
  headers: Headers,
  session: Pick<WaSession, 'id' | 'userId'>,
) {
  let user: Awaited<ReturnType<typeof requestUser>>
  try {
    user = await requestUser(headers)
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof RateLimitedError) return false
    throw error
  }
  return !!user && canAccessSession(user, session)
}

export async function authorizeSessionById(headers: Headers, sessionId: string) {
  const session = await prisma.waSession.findUnique({
    where: { id: sessionId },
  })
  return !!session && authorizeSession(headers, session)
}

export async function authenticateRealtime(headers: Headers) {
  return !!(await requestUser(headers))
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const user = await requestUser(c.req.raw.headers)
  if (!user) throw new UnauthorizedError('Access denied')
  if (user.apiKeyScope?.scope === 'session') {
    const sessionId = c.req.param('sessionId')
    const listing = c.req.method === 'GET' && c.req.path === '/api/v1/session'
    if (!listing && (c.req.path.startsWith('/admin/') || sessionId !== user.apiKeyScope.sessionId))
      throw new ForbiddenError('API key is restricted to one session')
  }
  requireTrustedOrigin(c.req.raw)
  c.set('user', user)
  const socketId = c.req.header('X-Realtime-Socket-Id')
  await runWithRealtimeOrigin(socketId ? { socketId, userId: user.id } : undefined, next)
})

export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await prisma.waSession.findUnique({
    where: { id: c.req.param('sessionId') },
  })
  if (!session) throw new UnauthorizedError('Unknown session')
  c.set('session', session)
  await next()
})

export const requireMcpAccess = createMiddleware<AppEnv>(async (c, next) => {
  const preset = c.req.header('x-zappaz-preset')
  const sessionId = c.req.header('x-zappaz-session-id')?.trim()
  if (preset !== 'user' && preset !== 'session') throw new BadRequestError('Invalid MCP preset')
  if (c.req.query('sessionId')) throw new BadRequestError('Use x-zappaz-session-id instead')
  if (preset === 'user') {
    if (sessionId) throw new BadRequestError('Session header is not allowed for user preset')
    const user = await requestUser(c.req.raw.headers)
    if (!user) throw new UnauthorizedError('Access denied')
    if (user.apiKeyScope?.scope === 'session')
      throw new ForbiddenError('Use the session MCP preset')
    if (user.role !== 'USER' && user.role !== 'ADMIN') throw new ForbiddenError('Access denied')
    if (c.req.header('Cookie')) requireTrustedOrigin(c.req.raw)
    c.set('user', user)
    return next()
  }
  if (!sessionId) throw new BadRequestError('x-zappaz-session-id is required')
  if (!['cookie', 'x-api-key'].some((name) => c.req.raw.headers.has(name)))
    throw new UnauthorizedError('Access denied')
  const session = await prisma.waSession.findUnique({ where: { id: sessionId } })
  if (!session || !(await authorizeSession(c.req.raw.headers, session)))
    throw new UnauthorizedError('Access denied')
  if (c.req.header('Cookie')) requireTrustedOrigin(c.req.raw)
  c.set('session', session)
  await next()
})

export const requireSessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get('session')
  if (!session) throw new UnauthorizedError('Unknown session')
  const user = await requestUser(c.req.raw.headers)
  if (user && canAccessSession(user, session)) {
    requireTrustedOrigin(c.req.raw)
    c.set('user', user)
    const socketId = c.req.header('X-Realtime-Socket-Id')
    return runWithRealtimeOrigin(socketId ? { socketId, userId: user.id } : undefined, next)
  }
  throw new UnauthorizedError('Access denied')
})
