import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const configPath = fileURLToPath(new URL('../../server/src/config.ts', import.meta.url))
const base = { PATH: Bun.env.PATH, HOME: '/tmp/opencode', CLIENT_SECRET: 'fixture-secret', DATABASE_URL: 'postgres://unused/unused' }

async function load(env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', `import { config } from ${JSON.stringify(configPath)}; console.log(JSON.stringify(config))`], {
    cwd: '/tmp/opencode', env, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout, stderr, code }
}

test('configuration needs only backend secrets and defaults to local development', async () => {
  const result = await load({ ...base, NODE_ENV: 'test' })
  expect(result.code).toBe(0)
  const bytes = 25 * 1024 * 1024
  const base64 = 4 * Math.ceil(bytes / 3)
  expect(JSON.parse(result.stdout)).toEqual({ isProduction: false, trustProxy: false, appUrl: 'http://localhost:5173', port: 3001, clientSecret: 'fixture-secret', dbUrl: 'postgres://unused/unused', messageRetentionDays: 90, webhookLogRetentionDays: 1, mediaMaxFileSizeMb: 25, mediaMaxFileSizeBytes: bytes, mediaMaxBase64Chars: base64, mediaMultipartBodyBytes: bytes + 1024 * 1024, mediaRequestBodyBytes: base64 + 1024 * 1024, admin: { ADMIN_RESET_PASSWORD: false }, mediaStorage: { enabled: false, driver: 'fs', path: './storage/media', forcePathStyle: false, supportsACL: false } })
})

test.each(['CLIENT_SECRET', 'DATABASE_URL'])('rejects missing %s', async (key) => {
  const result = await load({ ...base, [key]: '', NODE_ENV: 'test' })
  expect(result.code).not.toBe(0)
  expect(result.stderr).toContain(key)
})

test('production requires a valid HTTPS application URL', async () => {
  for (const APP_URL of ['', 'http://example.com', 'https://example.com/path']) {
    const result = await load({ ...base, NODE_ENV: 'production', APP_URL })
    expect(result.code).not.toBe(0)
  }
  const result = await load({ ...base, CLIENT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', NODE_ENV: 'production', APP_URL: 'https://example.com/' })
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout).appUrl).toBe('https://example.com')
})

test('startup reports invalid variables without leaking credentials', async () => {
  const result = await load({ ...base, CLIENT_SECRET: 'private-client-secret', DATABASE_URL: 'invalid-private-db-password', NODE_ENV: 'test' })
  expect(result.code).not.toBe(0)
  expect(result.stderr).toContain('DATABASE_URL')
  expect(result.stderr).not.toContain('invalid-private-db-password')
  expect(result.stderr).not.toContain('private-client-secret')
})

test('configuration is captured at startup rather than reread by consumers', async () => {
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', `import { config } from ${JSON.stringify(configPath)}; process.env.PORT = '9999'; process.env.DATABASE_URL = 'invalid'; console.log(JSON.stringify([config.port, config.dbUrl]))`], {
    cwd: '/tmp/opencode', env: { ...base, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
  expect(JSON.parse(stdout)).toEqual([3001, base.DATABASE_URL])
})

test('Prisma CLI loads with only DATABASE_URL and no API secrets', async () => {
  const prismaConfigPath = fileURLToPath(new URL('../../server/prisma.config.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, '--no-env-file', '-e', `import config from ${JSON.stringify(prismaConfigPath)}; console.log(config.datasource.url)`], {
    cwd: '/tmp/opencode', env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', DATABASE_URL: base.DATABASE_URL }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
  expect(stdout.trim()).toBe(base.DATABASE_URL)
})
