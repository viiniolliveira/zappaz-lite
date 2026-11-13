import type { WaSession } from '@generated/prisma'
import { Hono } from 'hono'
import type { AuthUser } from './lib/api-key-scope.ts'
import { privateResponse } from './middleware/private-response.ts'
import { requestLimits } from './middleware/request-limits.ts'
import { securityHeaders } from './middleware/security-headers.ts'

export type AppEnv = {
  Bindings: { clientIp?: string }
  Variables: {
    user: AuthUser | null
    token: string | null
    session: WaSession | null
    secureHeadersNonce?: string
  }
}

export function createRouter() {
  return new Hono<AppEnv>({ strict: false })
}

export default function createApp() {
  const app = createRouter()
  app.use('*', securityHeaders, privateResponse, requestLimits)
  return app
}
