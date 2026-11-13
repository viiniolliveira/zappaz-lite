import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('persists link flags across ingestion, edits, receipts, duplicates and deletion without a database', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const bun = Bun.which('bun')
  if (!bun) throw new Error('Bun executable not found')
  const child = Bun.spawn(
    [
      bun,
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fileURLToPath(new URL('./message-links-fixture.ts', import.meta.url)),
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        CLIENT_SECRET: 'test',
        DATABASE_URL: 'postgres://unused/unused',
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
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
