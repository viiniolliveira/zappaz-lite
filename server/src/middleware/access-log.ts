import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../create-app.ts'
import { logger } from '../lib/logger.ts'

export const accessLog = createMiddleware<AppEnv>(async (c, next) => {
  const startedAt = performance.now()
  await next()
  const path = c.req.path
  if (path === '/health' || path.startsWith('/assets/')) return
  const entry = {
    msg: 'HTTP request completed',
    extra: {
      source: 'http',
      function: 'accessLog',
      method: c.req.method,
      path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
  }
  if (c.res.status >= 500) logger.error(entry)
  else if (c.res.status >= 400) logger.warn(entry)
  else logger.info(entry)
})
