import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('labels belong to private conversations in one session and publish only after commit', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      `${root}test/chat/labels-service-fixture.ts`,
    ],
    {
      cwd: root,
      env: { PATH: Bun.env.PATH, NODE_ENV: 'test' },
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
