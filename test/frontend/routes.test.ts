import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { notFoundHandler } from '../../server/src/common/http/not-found-handler.ts'
import createApp from '../../server/src/create-app.ts'
import { createFrontendRouter } from '../../server/src/modules/frontend/route.ts'

const html = '<!doctype html><html><body>frontend fixture</body></html>'
const javascript = 'console.log("asset fixture")'
let fixture: string
let root: string

function appFor(rootPath: string) {
  const app = createApp()
  app.get('/health', (c) => c.json({ healthy: true }))
  app.get('/api/v1/example', (c) => c.json({ api: true }))
  app.route('/', createFrontendRouter(rootPath))
  app.notFound(notFoundHandler)
  return app
}

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404)
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(await response.json()).toEqual({
    ok: false,
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found' },
  })
}

beforeAll(async () => {
  fixture = await mkdtemp('/tmp/opencode/frontend-test-')
  root = join(fixture, 'dist')
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(fixture, 'empty'))
  await writeFile(join(root, 'index.html'), html)
  await writeFile(join(root, 'assets', 'app.js'), javascript)
  await writeFile(join(root, 'sw.js'), '/* service worker fixture */')
  await writeFile(join(root, 'manifest.webmanifest'), '{"name":"Zappaz Lite"}')
  await writeFile(join(root, 'offline.html'), '<h1>Sem conexão</h1>')
  await writeFile(join(root, '.secret'), 'hidden fixture')
  await writeFile(join(fixture, 'outside.txt'), 'outside fixture')
})

afterAll(async () => {
  if (fixture) await rm(fixture, { recursive: true, force: true })
})

describe('built frontend routes', () => {
  test('serves PWA resources without stale worker or manifest responses', async () => {
    const app = appFor(root)
    for (const [path, type] of [['/sw.js', 'javascript'], ['/manifest.webmanifest', 'manifest+json']]) {
      const response = await app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(type)
      expect(response.headers.get('cache-control')).toBe('no-cache')
    }
    const offline = await app.request('/offline.html')
    expect(offline.status).toBe(200)
    expect(offline.headers.get('content-type')).toContain('text/html')
    expect(await offline.text()).toContain('Sem conexão')
  })
  test('serves the index with HTML content type and no-cache', async () => {
    const app = appFor(root)
    const index = await app.request('/')
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toContain('text/html')
    expect(index.headers.get('cache-control')).toBe('no-cache')
    expect(await index.text()).toBe(html)
  })

  test('serves static assets with the appropriate content type', async () => {
    const app = appFor(root)
    const asset = await app.request('/assets/app.js')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toContain('javascript')
    expect(await asset.text()).toBe(javascript)
  })

  test('serves the SPA index for HTML navigation to extensionless deep links', async () => {
    const app = appFor(root)
    for (const path of ['/sessions/id', '/account']) {
      const response = await app.request(path, {
        headers: { Accept: 'text/html' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-cache')
      expect(await response.text()).toBe(html)
    }
    await expectNotFound(
      await app.request('/account', {
        headers: { Accept: 'application/json' },
      }),
    )
    await expectNotFound(await app.request('/account'))
  })

  test('preserves registered API and health routes and their namespaces', async () => {
    const app = appFor(root)
    expect(await (await app.request('/health')).json()).toEqual({
      healthy: true,
    })
    expect(await (await app.request('/api/v1/example')).json()).toEqual({
      api: true,
    })
    for (const path of [
      '/api',
      '/api/v1/missing',
      '/admin',
      '/admin/missing',
      '/health/missing',
    ]) {
      await expectNotFound(
        await app.request(path, { headers: { Accept: 'text/html' } }),
      )
    }
  })

  test('does not serve the SPA for the MCP namespace', async () => {
    const app = appFor(root)
    for (const path of [
      '/mcp',
      '/mcp/',
      '/mcp/unknown',
      '/mcp/unknown/nested',
    ]) {
      await expectNotFound(
        await app.request(path, { headers: { Accept: 'text/html' } }),
      )
    }
    const response = await app.request('/mcportal', {
      headers: { Accept: 'text/html' },
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(html)
  })

  test('does not use the SPA fallback for missing assets or files', async () => {
    const app = appFor(root)
    for (const path of [
      '/assets',
      '/assets/missing',
      '/assets/missing.js',
      '/missing.js',
    ]) {
      await expectNotFound(
        await app.request(path, { headers: { Accept: 'text/html' } }),
      )
    }
  })

  test('does not serve the SPA for non-GET requests', async () => {
    const app = appFor(root)
    for (const method of ['POST', 'PUT', 'DELETE']) {
      await expectNotFound(
        await app.request('/account', {
          method,
          headers: { Accept: 'text/html' },
        }),
      )
    }
  })

  test.each(['/', '/assets/app.js', '/account'])(
    'HEAD %s returns headers without a response body',
    async (path) => {
      const app = appFor(root)
      const response = await app.request(path, {
        method: 'HEAD',
        headers: { Accept: 'text/html' },
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('')
    },
  )

  test('returns JSON 404 when the build is absent', async () => {
    const app = appFor(join(fixture, 'empty'))
    for (const path of ['/', '/account', '/assets/app.js']) {
      await expectNotFound(
        await app.request(path, { headers: { Accept: 'text/html' } }),
      )
    }
  })

  test('does not expose hidden files or files outside the build', async () => {
    const app = appFor(root)
    for (const path of [
      '/.secret',
      '/%2esecret',
      '/%2e%2e%2foutside.txt',
      '/assets/%2e%2e%2f%2e%2e%2foutside.txt',
    ]) {
      await expectNotFound(
        await app.request(path, { headers: { Accept: 'text/html' } }),
      )
    }
  })
})
