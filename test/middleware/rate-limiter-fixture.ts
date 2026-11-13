import { strict as assert } from 'node:assert'
import { setSystemTime } from 'bun:test'
import { Hono } from 'hono'
import { AppError } from '../../server/src/common/errors/app-error.ts'

const { rateLimiter } = await import('../../server/src/middleware/rate-limiter.ts')
const app = new Hono()
app.onError((error, c) => {
  if (error instanceof AppError) return c.json({ code: error.code }, error.status)
  throw error
})
app.get('/general', rateLimiter, (c) => c.text('ok'))

const start = new Date('2026-01-01T00:00:00Z').getTime()
const general = (ip: string, forwarded = 'spoofed') => app.request('/general', { headers: { 'x-forwarded-for': forwarded } }, { clientIp: ip })

try {
  setSystemTime(start)
  for (let i = 0; i < 100; i++) assert.equal((await general('token-a')).status, 200, `general request ${i + 1}`)
  assert.equal((await general('token-a', 'different-spoofed-ip')).status, 429)
  assert.equal((await general('token-b')).status, 200)
  setSystemTime(start + 4_999)
  assert.equal((await general('token-a')).status, 429)
  setSystemTime(start + 5_000)
  assert.equal((await general('token-a')).status, 200)

} finally {
  setSystemTime()
}
