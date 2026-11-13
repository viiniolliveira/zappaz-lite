import { expect, test } from 'bun:test'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

for (const flag of [undefined, 'false', 'true'] as const) {
  test(`client IP selection with TRUST_PROXY ${flag ?? 'omitted'}`, async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const fixture = fileURLToPath(new URL('./client-ip-fixture.ts', import.meta.url))
    const child = Bun.spawn(
      [execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture],
      {
        cwd: '/tmp/opencode',
        env: {
          PATH: Bun.env.PATH,
          HOME: '/tmp/opencode',
          NODE_ENV: 'test',
          CLIENT_SECRET: 'test',
          DATABASE_URL: 'postgres://unused/unused',
          ...(flag === undefined ? {} : { TRUST_PROXY: flag }),
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
}
