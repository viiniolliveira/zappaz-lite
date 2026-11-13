import { expect, test } from 'bun:test'

for (const scenario of ['delete', 'logout', 'disabled']) {
  test(`session cleanup removes only its encoded filesystem prefix: ${scenario}`, async () => {
    const root = new URL('../../', import.meta.url).pathname
    const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/chat/session-deletion-fixture.ts`, scenario], {
      cwd: '/tmp/opencode',
      env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test', CLIENT_SECRET: 'test-secret', DATABASE_URL: 'postgresql://unused/unused', MEDIA_STORAGE_ENABLED: 'false' },
      stdout: 'pipe', stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  })
}

for (const scenario of ['delete', 'logout']) {
  test(`session cleanup preserves records after storage failure and supports retry: ${scenario}`, async () => {
    const root = new URL('../../', import.meta.url).pathname
    const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/chat/session-deletion-failure-fixture.ts`, scenario], {
      cwd: '/tmp/opencode',
      env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test', CLIENT_SECRET: 'test-secret', DATABASE_URL: 'postgresql://unused/unused', MEDIA_STORAGE_ENABLED: 'false' },
      stdout: 'pipe', stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  })
}
