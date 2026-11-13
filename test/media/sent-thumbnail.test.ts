import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('persists the reported API video thumbnail in the media row', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), 'zappaz-sent-thumbnail-'))
  try {
    const child = Bun.spawn([process.execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/media/sent-thumbnail-fixture.ts`], {
      cwd: directory,
      env: { PATH: Bun.env.PATH, HOME: directory, CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
      stdout: 'pipe', stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
