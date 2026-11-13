import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'
import * as Bun from 'bun'

test('global webhook routes enforce admin authentication and support validated CRUD', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./routes-fixture.ts', import.meta.url))
  const directory = await mkdtemp(join(tmpdir(), 'zappaz-global-webhooks-'))
  try {
    const process = Bun.spawn(
      [
        execPath,
        '--no-env-file',
        '--tsconfig-override',
        `${root}server/tsconfig.json`,
        fixture,
      ],
      {
        cwd: directory,
        env: {
          PATH: Bun.env.PATH,
          HOME: directory,
          CLIENT_SECRET: 'test',
          DATABASE_URL: 'postgres://unused/unused',
            NODE_ENV: 'test',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    expect({
      exitCode,
      stdout: exitCode ? stdout : '',
      stderr: exitCode ? stderr : '',
    }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
