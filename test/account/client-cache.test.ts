import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('account auth client updates caches through native endpoints', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./client-cache-fixture.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, 'test', '--no-env-file', '--tsconfig-override', `${root}tsconfig.json`, fixture], {
    cwd: root, env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
