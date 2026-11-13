import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('received typing resolves private PN/LID conversations without creating records or sending presence', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./presence-fixture.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture], {
    cwd: root,
    env: {
      PATH: Bun.env.PATH,
      NODE_ENV: 'test',
      CLIENT_SECRET: 'presence-test-secret',
      DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
