import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { corsMiddleware } from '../../server/src/middleware/cors.ts'

const app = new Hono()
app.use('*', corsMiddleware)
app.get('/', c => c.text('ok'))
const production = process.env.NODE_ENV === 'production'
const allowed = production ? 'https://app.example' : 'http://localhost:5173'
for (const [origin, expected] of [[allowed, allowed], ['https://evil.example', null], ['https://app.example.evil', null], ...(production ? [['http://localhost:5173', null]] : [['http://127.0.0.1:3001', 'http://127.0.0.1:3001']])] as Array<[string, string | null]>) {
  const response = await app.request('/', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } })
  assert.equal(response.headers.get('access-control-allow-origin'), expected)
  if (expected) assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
}
