import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

test('quick message CRUD enforces session authorization, uniqueness and invalidation', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./quick-messages-api-fixture.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture], {
    cwd: tmpdir(), env: { PATH: Bun.env.PATH, NODE_ENV: 'test', CLIENT_SECRET: 'test-secret', DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused', APP_URL: 'http://localhost:3001' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
