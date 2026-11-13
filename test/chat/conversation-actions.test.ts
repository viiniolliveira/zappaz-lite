import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('conversation batch actions preserve scope, partial failures and local read state', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./conversation-actions-fixture.ts', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}tsconfig.app.json`,
      fixture,
    ],
    {
      cwd: root,
      env: { PATH: Bun.env.PATH, HOME: root, NODE_ENV: 'test' },
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
