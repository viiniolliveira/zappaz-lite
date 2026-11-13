import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('general rate limiter isolates trusted client IPs and enforces its window', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./rate-limiter-fixture.ts', import.meta.url))
  const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
