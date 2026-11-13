import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('media count and cursor pages use one transaction without a database', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./media-list-isolated-fixture.ts', import.meta.url))
  const bun = Bun.which('bun')
  if (!bun) throw new Error('Bun executable not found')
  const child = Bun.spawn(
    [bun, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test-secret',
        DATABASE_URL: 'postgresql://unused:unused@localhost:5432/unused',
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
})
