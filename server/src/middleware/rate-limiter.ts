import { RateLimitedError } from '@server/common/errors/rate-limited-error'
import type { AppEnv } from '@server/create-app'
import { rateLimiter as createRateLimiter } from 'hono-rate-limiter'

const FIVE_SECONDS = 5_000

export const rateLimiter = createRateLimiter<AppEnv>({
  windowMs: FIVE_SECONDS,
  limit: 100,
  keyGenerator: (c) => c.env?.clientIp ?? 'unknown',
  handler: () => {
    throw new RateLimitedError(
      `Rate limit exceeded. Blocked until ${new Date(Date.now() + FIVE_SECONDS).toTimeString()}, five seconds.`,
    )
  },
})
