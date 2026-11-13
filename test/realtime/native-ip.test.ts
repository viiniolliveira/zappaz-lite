import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('real Bun Engine applies handshake budgets per native transport IP', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./native-ip-fixture.ts', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
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
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  })
}, 30_000)
