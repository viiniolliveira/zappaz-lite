import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test.each([
  'contacts',
  'summaries',
  'contacts-database',
  'summaries-database',
])('real batch store isolates conflicts and propagates database errors: %s', async (scenario) => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const bun = Bun.which('bun')
  if (!bun) throw new Error('bun executable not found')
  const child = Bun.spawn(
    [
      bun,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fileURLToPath(new URL('./chat-batch-fixture.ts', import.meta.url)),
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
