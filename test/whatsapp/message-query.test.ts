import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('message queries validate filters, scope identities and paginate with filter-bound cursors', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn([
    Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`,
    fileURLToPath(new URL('./message-query-fixture.ts', import.meta.url)),
  ], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
