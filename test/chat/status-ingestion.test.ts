import { expect, test } from 'bun:test'

test('ignores live and historical Status publications while accepting private replies to Status', async () => {
  const root = new URL('../../', import.meta.url).pathname
  const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/chat/status-ingestion-fixture.ts`], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
