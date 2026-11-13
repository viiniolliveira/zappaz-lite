import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

for (const scenario of [
  'valid',
  'destinations',
  'wrapped-and-thumbnail',
  'unsafe-reupload',
  'retry-404',
  'retry-410',
  'errors',
  'size',
  'custom-size',
  'concurrency',
]) {
  test(`received media: ${scenario}`, async () => {
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const fixture = fileURLToPath(new URL('./whatsapp-media-fixture.ts', import.meta.url))
    const bun = Bun.which('bun')
    if (!bun) throw new Error('Bun executable not found')
    const child = Bun.spawn(
      [
        bun,
        '--no-env-file',
        '--tsconfig-override',
        `${root}server/tsconfig.json`,
        fixture,
        scenario,
      ],
      {
        cwd: '/tmp/opencode',
        env: {
          PATH: Bun.env.PATH,
          HOME: '/tmp/opencode',
          NODE_ENV: 'test',
          DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
          CLIENT_SECRET: 'test-secret-with-at-least-thirty-two-characters',
          ...(scenario === 'custom-size' ? { MEDIA_MAX_FILE_SIZE_MB: '1' } : {}),
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
  }, 30000)
}

test('outbound agents validate socket DNS lookups without network', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./whatsapp-media-agent-fixture.ts', import.meta.url))
  const bun = Bun.which('bun')
  if (!bun) throw new Error('Bun executable not found')
  const child = Bun.spawn(
    [bun, 'test', '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture],
    {
      cwd: '/tmp/opencode',
      env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test', CLIENT_SECRET: 'test-secret', DATABASE_URL: 'postgres://unused/unused' },
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
  expect(stderr).toContain('1 pass')
}, 30000)
