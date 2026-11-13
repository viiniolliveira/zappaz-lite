import { Scalar } from '@scalar/hono-api-reference'
import createApp, { type AppEnv } from '../../server/src/create-app.ts'

const app = createApp()
app.onError((_error, c) => c.json({ error: 'denied' }, 401))
app.get('/', (c) => c.html('<h1>SPA</h1>'))
app.get(
  '/docs',
  Scalar<AppEnv>((c) => ({ content: { openapi: '3.1.0' }, nonce: c.get('secureHeadersNonce') })),
)
app.get('/api/error', () => {
  throw new Error('denied')
})

const results = []
for (const path of ['/', '/docs', '/api/error', '/missing']) {
  for (const proto of ['http', 'https']) {
    const response = await app.request(`http://127.0.0.1:3001${path}`, {
      headers: {
        Host: 'attacker.example:9443',
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': 'attacker.example:9443',
        Forwarded: 'for=192.0.2.1;host=attacker.example:9443;proto=https',
      },
    })
    results.push({
      path,
      proto,
      status: response.status,
      csp: response.headers.get('content-security-policy'),
      hsts: response.headers.get('strict-transport-security'),
      html: path === '/docs' ? await response.text() : '',
    })
  }
}
console.log(JSON.stringify(results))
