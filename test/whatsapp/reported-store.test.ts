import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('persists rich content and emits current DTOs without database, network or legacy reads', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fileURLToPath(new URL('./reported-store-fixture.ts', import.meta.url)),
    ],
    {
      cwd: root,
      env: {
        PATH: Bun.env.PATH,
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
        NODE_ENV: 'test',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
