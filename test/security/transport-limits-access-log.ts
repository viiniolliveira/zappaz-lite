import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
const entries: { level: string; entry: unknown }[] = []
mock.module('../../server/src/lib/logger.ts', () => ({ logger: {
  info: (entry: unknown) => entries.push({ level: 'info', entry }),
  warn: (entry: unknown) => entries.push({ level: 'warn', entry }),
  error: (entry: unknown) => entries.push({ level: 'error', entry }),
} }))
const { createRouter } = await import('../../server/src/create-app.ts')
const { accessLog } = await import('../../server/src/middleware/access-log.ts')
const app = createRouter()
app.use('*', accessLog)
app.post('/resource', async (c) => { await c.req.text(); return c.text('ok') })
app.get('/bad', (c) => c.text('bad', 400))
app.get('/failure', (c) => c.text('failure', 500))
app.get('/health', (c) => c.text('ok'))
app.get('/assets/test.js', (c) => c.text('asset'))
await app.request('/resource?secret=query-secret', { method: 'POST', headers: { authorization: 'Bearer header-secret' }, body: 'body-secret' })
await app.request('/bad')
await app.request('/failure')
await app.request('/health')
await app.request('/assets/test.js')
assert.deepEqual(entries.map(({ level }) => level), ['info', 'warn', 'error'])
const serialized = JSON.stringify(entries)
for (const secret of ['query-secret', 'header-secret', 'body-secret']) assert(!serialized.includes(secret))
const first = entries[0].entry as { extra: Record<string, unknown> }
assert.equal(first.extra.method, 'POST')
assert.equal(first.extra.path, '/resource')
assert.equal(first.extra.status, 200)
assert.equal(typeof first.extra.durationMs, 'number')
