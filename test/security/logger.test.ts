import { expect, test } from 'bun:test'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

test('production root and Baileys children share sanitized JSON output without changing the root level', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./logger-fixture.ts', import.meta.url))
  const child = Bun.spawn(
    [execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, fixture],
    {
      cwd: '/tmp/opencode',
      env: {
        PATH: Bun.env.PATH,
        HOME: '/tmp/opencode',
        NODE_ENV: 'production',
        CLIENT_SECRET: 'aB3dE5gH7jK9mN2pQ4rS6tV8wX1yZ0ab',
        DATABASE_URL: 'postgres://unused/unused',
        APP_URL: 'https://app.invalid',
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
  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
  const entries = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(entries.map(({ event, level, source }) => ({ event, level, source }))).toEqual([
    { event: 'root', level: 30, source: undefined },
    { event: 'baileys', level: 50, source: 'baileys' },
    { event: 'child', level: 50, source: 'baileys' },
    { event: 'root-after-child', level: 30, source: undefined },
  ])
  expect(entries[0]).toMatchObject({
    token: '[REDACTED]',
    payload: '[REDACTED]',
    msg: 'root password=[REDACTED]',
  })
  expect(entries[1]).toMatchObject({
    authorization: '[REDACTED]',
    data: '[REDACTED]',
    msg: 'baileys [REDACTED]',
  })
  expect(entries[2]).toMatchObject({
    cookie: '[REDACTED]',
    context: { apiKey: '[REDACTED]' },
    body: '[REDACTED]',
    nested: { password: '[REDACTED]' },
    msg: 'child token=[REDACTED]',
  })
  for (const value of [
    'root-secret',
    'root-payload',
    'root-message-secret',
    'baileys-secret',
    'baileys-payload',
    'baileys-message-secret',
    'child-secret',
    'child-api-secret',
    'child-payload',
    'child-password',
    'child-message-secret',
    'should not appear',
  ]) {
    expect(stdout).not.toContain(value)
  }
})

test('HTTP access logging selects safe request fields and severity', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const fixture = fileURLToPath(new URL('./transport-limits-access-log.ts', import.meta.url))
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
  expect({ exitCode, stderr, stdout: exitCode ? stdout : '' }).toEqual({
    exitCode: 0,
    stderr: '',
    stdout: '',
  })
})
