import { expect, test } from 'bun:test'
import createApp from '../../server/src/create-app.ts'

test('private responses, authentication errors and QR/tokens are never cacheable', async () => {
  const app = createApp()
  app.onError((_error, c) => c.json({ error: 'denied' }, 401))
  app.get('/api/token', (c) => c.json({ token: 'synthetic' }))
  app.get('/api/qr', () => { throw new Error('denied') })
  app.get('/admin/private', (c) => c.text('private'))
  app.get('/mcp', (c) => c.json({}))
  app.get('/assets/app.js', (c) => { c.header('Cache-Control', 'public, max-age=31536000, immutable'); return c.text('public') })
  for (const path of ['/api/token', '/api/qr', '/admin/private', '/mcp', '/api/missing', '/docs', '/openapi.json']) {
    expect((await app.request(path)).headers.get('Cache-Control')).toBe('private, no-store')
  }
  expect((await app.request('/assets/app.js')).headers.get('Cache-Control')).toContain('immutable')
  for (const cookie of ['session=user-a', 'session=user-b']) {
    expect((await app.request('/assets/app.js', { headers: { cookie } })).headers.get('Cache-Control')).toBe('private, no-store')
  }
  for (const header of ['x-api-key', 'authorization']) {
    expect((await app.request('/assets/app.js', { headers: { [header]: 'synthetic' } })).headers.get('Cache-Control')).toBe('private, no-store')
  }
})
