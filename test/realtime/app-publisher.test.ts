import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('application events authorize users and exclude only their originating socket', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./app-publisher-fixture.ts', import.meta.url))
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
        NODE_ENV: 'test',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
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
})
