import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import viteConfig from '../../vite.config.ts'

test('HTTP and WebSocket clients use the browser origin', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./same-origin-fixture.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, '--no-env-file', '--tsconfig-override', `${root}tsconfig.app.json`, fixture], {
    cwd: '/tmp/opencode', env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', VITE_API_URL: 'https://wrong.example' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})

test('Vite proxies backend routes including WebSocket without exposing VITE variables', () => {
  expect(viteConfig.envPrefix).toEqual([])
  const proxy = viteConfig.server?.proxy
  expect(proxy).toBeDefined()
  for (const route of ['^/api(?:/|$)', '/admin', '/mcp', '/health', '/docs', '/openapi.json']) {
    expect(proxy?.[route]).toMatchObject({ target: 'http://localhost:3001' })
  }
  expect(proxy?.['^/api(?:/|$)']).toMatchObject({ ws: true })
  const matchesProxy = (path: string) => Object.keys(proxy ?? {}).some(context =>
    context.startsWith('^') ? new RegExp(context).test(path) : path.startsWith(context),
  )
  for (const path of ['/api', '/api/v1/session', '/api/auth/api-key/create', '/api/ws']) expect(matchesProxy(path)).toBe(true)
  expect(matchesProxy('/api-keys')).toBe(false)
})
