import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

// A separate process confines module mocks and disables automatic .env loading.
test('forwards normalized session and global webhooks and replays new and legacy logs', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(
    new URL('./webhook-fixture.ts', import.meta.url),
  )
  const process = Bun.spawn(
    [
      Bun.which('bun')!,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fixture,
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
        NODE_ENV: 'test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  expect({
    exitCode,
    stdout: exitCode ? stdout : '',
    stderr: exitCode ? stderr : '',
  }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
