import { expect, test } from 'bun:test'
import { Scalar } from '@scalar/hono-api-reference'
import createApp, { type AppEnv } from '../../server/src/create-app.ts'

test('security headers protect HTML, private routes, errors and misses without enabling HSTS on HTTP', async () => {
  const app = createApp()
  app.onError((_error, c) => c.json({ error: 'denied' }, 401))
  app.get('/', (c) => c.html('<h1>SPA</h1>'))
  app.get('/api/error', () => {
    throw new Error('denied')
  })
  for (const path of ['/', '/api/error', '/missing']) {
    const response = await app.request(`https://app.example${path}`)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('Permissions-Policy')).toContain('microphone=(self)')
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()')
    expect(response.headers.get('Strict-Transport-Security')).toBeNull()
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';")
    expect(csp).toContain('frame-src https://www.youtube.com https://www.youtube-nocookie.com;')
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).toContain("connect-src 'self' wss://app.example")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).not.toContain('cdn.jsdelivr.net')
  }
})

test('Scalar receives a fresh CSP nonce matching its inline and external script tags', async () => {
  const app = createApp()
  app.get(
    '/docs',
    Scalar<AppEnv>((c) => ({ content: { openapi: '3.1.0' }, nonce: c.get('secureHeadersNonce') })),
  )
  const first = await app.request('/docs')
  const html = await first.text()
  const nonce = first.headers.get('Content-Security-Policy')?.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce).toBeDefined()
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]
  expect(scripts.length).toBeGreaterThan(0)
  for (const script of scripts) expect(script[1]).toContain(`nonce="${nonce}"`)
  expect((await app.request('/docs')).headers.get('Content-Security-Policy')).not.toContain(
    `'nonce-${nonce}'`,
  )
})

test('development websocket CSP uses the request origin including its port', async () => {
  const app = createApp()
  app.get('/', (c) => c.text('ok'))
  for (const [url, origin] of [
    ['http://127.0.0.1:41731/', 'ws://127.0.0.1:41731'],
    ['https://localhost:8444/', 'wss://localhost:8444'],
  ]) {
    const csp = (await app.request(url)).headers.get('content-security-policy') ?? ''
    expect(csp.match(/(?:^|;\s*)connect-src ([^;]+)/)?.[1]).toBe(`'self' ${origin}`)
  }
})

test('production websocket CSP trusts only APP_URL despite internal HTTP and untrusted proxy headers', async () => {
  const fixture = new URL('./security-headers-production-fixture.ts', import.meta.url).pathname
  const tsconfig = new URL('../../server/tsconfig.json', import.meta.url).pathname
  const child = Bun.spawn(
    [process.execPath, '--no-env-file', '--tsconfig-override', tsconfig, fixture],
    {
      cwd: '/tmp/opencode',
      env: {
        NODE_ENV: 'production',
        CLIENT_SECRET: '8Yv5mQ2sN9cK4xF7pR3wH6tB1zD0jLqA',
        DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
        APP_URL: 'https://app.example.test:8443/',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`Production fixture failed (${code}): ${stderr}\n${stdout}`)
  const results = JSON.parse(stdout) as {
    path: string
    proto: string
    status: number
    csp: string
    hsts: string | null
    html: string
  }[]
  expect(results).toHaveLength(8)
  for (const { path, status, csp, hsts, html } of results) {
    expect(status).toBe(path === '/missing' ? 404 : path === '/api/error' ? 401 : 200)
    expect(hsts).toBeNull()
    expect(csp.match(/(?:^|;\s*)connect-src ([^;]+)/)?.[1]).toBe(
      "'self' wss://app.example.test:8443",
    )
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
    if (path === '/docs') {
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1]
      expect(nonce).toBeDefined()
      const scripts = [...html.matchAll(/<script\b([^>]*)>/g)]
      expect(scripts.length).toBeGreaterThan(0)
      for (const script of scripts) expect(script[1]).toContain(`nonce="${nonce}"`)
    } else {
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval';")
      expect(csp).not.toContain('cdn.jsdelivr.net')
    }
  }
})
