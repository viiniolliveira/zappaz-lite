import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test.each([
  'classifier',
  'explicit-mappings',
  'mapping-without-contact',
  'known-local-mapping',
  'mapping-after-completion',
  'lookup-failure',
  'history',
  'upsert',
  'database',
  'contacts-database',
  'conversations-database',
])('isolates identity conflicts and propagates unrelated failures: %s', async (scenario) => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fileURLToPath(new URL('./history-conflict-fixture.ts', import.meta.url)),
      scenario,
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
        CLIENT_SECRET: 'test',
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
