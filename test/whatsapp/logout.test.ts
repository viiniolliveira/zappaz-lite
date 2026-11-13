import { expect, test } from 'bun:test'

test('logout waits for the disconnected status to be persisted before returning', async () => {
  const root = new URL('../../', import.meta.url).pathname
  const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/whatsapp/logout-fixture.ts`], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})

test('only an actual remote logout clears messages; disconnects and QR exhaustion preserve them', async () => {
  const root = new URL('../../', import.meta.url).pathname
  const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/whatsapp/logout-events-fixture.ts`], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})

test('event listener drains pending data before remote logout and ignores stale clients', async () => {
  const root = new URL('../../', import.meta.url).pathname
  const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/whatsapp/logout-event-listeners-fixture.ts`], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://unused/unused', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
