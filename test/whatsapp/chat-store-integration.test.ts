import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { validateChatTestDatabaseUrl } from './chat-test-database.ts'

const requestedUrl = Bun.env.CHAT_TEST_DATABASE_URL

test.skipIf(!requestedUrl)('persists chat ingestion in the explicitly selected disposable database', async () => {
  if (!requestedUrl) throw new Error('CHAT_TEST_DATABASE_URL is required')
  const disposableUrl = validateChatTestDatabaseUrl(requestedUrl)
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const child = Bun.spawn([
    Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`,
    fileURLToPath(new URL('./chat-store-fixture.ts', import.meta.url)),
  ], {
    cwd: '/tmp/opencode',
    env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', DATABASE_URL: disposableUrl, CHAT_TEST_DATABASE_URL: disposableUrl, CLIENT_SECRET: 'test', NODE_ENV: 'test' },
    stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})

test('accepts only local PostgreSQL chat_validation URLs', () => {
  for (const url of ['postgres://user:secret@localhost:1234/chat_validation', 'postgresql://127.0.0.1/chat_validation', 'postgresql://[::1]/chat_validation']) {
    expect(validateChatTestDatabaseUrl(url)).toBe(url)
  }
  for (const url of ['not a url', 'https://localhost/chat_validation', 'postgres://remote/chat_validation', 'postgres://localhost/production', 'postgres://localhost/chat_validation?host=remote', 'postgres://localhost/chat_validation?dbname=production']) {
    expect(() => validateChatTestDatabaseUrl(url)).toThrow()
  }
})
