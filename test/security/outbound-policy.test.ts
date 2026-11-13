import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('outbound policy and transport use isolated backend configuration', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./outbound-policy-fixture.ts', import.meta.url))
  const child = Bun.spawn(
    [
      process.execPath,
      'test',
      '--no-env-file',
      '--tsconfig-override',
      `${root}server/tsconfig.json`,
      fixture,
    ],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        NODE_ENV: 'test',
        CLIENT_SECRET: 'test-secret',
        DATABASE_URL: 'postgres://unused/unused',
        MEDIA_MAX_FILE_SIZE_MB: '1',
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
  expect(stderr).toContain('3 pass')
})
