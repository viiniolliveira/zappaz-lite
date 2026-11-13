import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('bulk labels load the full selection, combine changes, preserve untouched labels and isolate failures and sessions', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}tsconfig.app.json`,
      `${root}test/chat/labels-atoms-fixture.ts`,
    ],
    { cwd: root, env: { PATH: Bun.env.PATH, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe' },
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
