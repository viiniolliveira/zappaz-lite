import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('ignores protocol envelopes without a target before any chat persistence or realtime update', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn([
    Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`,
    fileURLToPath(new URL('./chat-protocol-fixture.ts', import.meta.url)),
  ], {
    cwd: root,
    env: { PATH: Bun.env.PATH, CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
