import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('session creation defaults to enabled and restricts disabled creation to administrators', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./create-session-fixture.ts', import.meta.url))
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
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
