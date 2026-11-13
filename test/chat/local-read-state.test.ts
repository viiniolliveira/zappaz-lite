import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('local read-state service scopes private history and publishes only after commit', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./local-read-state-fixture.ts', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fixture,
    ],
    {
      cwd: root,
      env: {
        PATH: Bun.env.PATH,
        HOME: root,
        NODE_ENV: 'test',
        CLIENT_SECRET: 'test-secret',
        DATABASE_URL: 'postgresql://unused:unused@localhost:1/unused',
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
