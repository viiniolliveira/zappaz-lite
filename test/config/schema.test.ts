import { describe, expect, test } from 'bun:test'
import { AdminEnvSchema, DatabaseEnvSchema, parseConfig } from '../../server/src/config-schema.ts'
import { constants as bufferConstants } from 'node:buffer'

const base = { CLIENT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', DATABASE_URL: 'postgresql://user:password@database:5432/zappaz' }

test('parses typed application settings from one source', () => {
  expect(parseConfig({
    ...base, NODE_ENV: 'production', APP_URL: 'https://app.example/', PORT: '8080', TRUST_PROXY: 'true',
    MESSAGE_RETENTION_DAYS: 'off', WEBHOOK_LOG_RETENTION_DAYS: '7',
    ADMIN_EMAIL: 'ADMIN@example.com', ADMIN_PASSWORD: 'fixture-password', ADMIN_RESET_PASSWORD: 'true',
    MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 's3',
    S3_BUCKET: 'private', S3_REGION: 'auto', S3_ENDPOINT: 'https://storage.example',
    S3_ACCESS_KEY_ID: 'access', S3_SECRET_ACCESS_KEY: 'secret', S3_FORCE_PATH_STYLE: 'true', S3_SUPPORTS_ACL: 'false',
  })).toEqual({
    isProduction: true, appUrl: 'https://app.example', port: 8080, trustProxy: true,
    clientSecret: base.CLIENT_SECRET, dbUrl: base.DATABASE_URL,
    messageRetentionDays: null, webhookLogRetentionDays: 7,
    mediaMaxFileSizeMb: 25, mediaMaxFileSizeBytes: 25 * 1024 * 1024,
    mediaMaxBase64Chars: 4 * Math.ceil(25 * 1024 * 1024 / 3),
    mediaMultipartBodyBytes: 26 * 1024 * 1024,
    mediaRequestBodyBytes: 4 * Math.ceil(25 * 1024 * 1024 / 3) + 1024 * 1024,
    admin: { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'fixture-password', ADMIN_RESET_PASSWORD: true },
    mediaStorage: { enabled: true, driver: 's3', path: './storage/media', bucket: 'private', region: 'auto', endpoint: 'https://storage.example', accessKeyId: 'access', secretAccessKey: 'secret', forcePathStyle: true, supportsACL: false },
  })
})

describe('media size configuration', () => {
  const mib = 1024 * 1024
  test.each([1, 50])('derives consistent request budgets for %i MiB', (mb) => {
    const config = parseConfig({ ...base, MEDIA_MAX_FILE_SIZE_MB: String(mb) })
    const bytes = mb * mib
    const base64 = 4 * Math.ceil(bytes / 3)
    expect(config.mediaMaxFileSizeMb).toBe(mb)
    expect(config.mediaMaxFileSizeBytes).toBe(bytes)
    expect(config.mediaMaxBase64Chars).toBe(base64)
    expect(config.mediaMultipartBodyBytes).toBe(bytes + mib)
    expect(config.mediaRequestBodyBytes).toBe(Math.max(bytes + mib, base64 + mib))
  })

  test.each(['', '0', '-1', '1.5', 'NaN', 'Infinity', ' 1', '1x', '999999999999999999999999'])('rejects invalid size %s', (value) => {
    expect(() => parseConfig({ ...base, MEDIA_MAX_FILE_SIZE_MB: value })).toThrow()
  })

  test('accepts the largest platform-supported budget and rejects the next MiB', () => {
    const maxMb = Math.floor((bufferConstants.MAX_LENGTH - mib) * 3 / 4 / mib)
    expect(parseConfig({ ...base, MEDIA_MAX_FILE_SIZE_MB: String(maxMb) }).mediaMaxFileSizeMb).toBe(maxMb)
    expect(() => parseConfig({ ...base, MEDIA_MAX_FILE_SIZE_MB: String(maxMb + 1) })).toThrow()
  })
})

describe('invalid environment values', () => {
  const cases = [
    ['PORT', ['', '0', '-1', '1.5', '65536', 'NaN', ' 3001', '3001abc']],
    ['NODE_ENV', ['', 'staging']],
    ['DATABASE_URL', ['', 'not-a-url', 'https://database.example', 'mysql://user:pass@host/db']],
    ['TRUST_PROXY', ['', 'TRUE', 'yes', '1']],
    ['ADMIN_RESET_PASSWORD', ['', 'TRUE', 'yes', '1']],
    ['ADMIN_EMAIL', ['invalid']],
    ['ADMIN_PASSWORD', ['short', 'x'.repeat(129)]],
    ['MEDIA_STORAGE_ENABLED', ['', 'TRUE', '1']],
    ['MEDIA_STORAGE_DRIVER', ['', 'invalid']],
    ['MEDIA_STORAGE_PATH', ['']],
    ['S3_ENDPOINT', ['invalid']],
    ['S3_FORCE_PATH_STYLE', ['', 'yes']],
    ['S3_SUPPORTS_ACL', ['', '1']],
  ] as const
  for (const [name, values] of cases) {
    test.each(values)(`rejects ${name}=%s`, (value) => {
      expect(() => parseConfig({ ...base, [name]: value })).toThrow(name)
    })
  }
})

test('administrator credentials may be absent except when a reset is requested', () => {
  expect(AdminEnvSchema.parse({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' })).toEqual({ ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined, ADMIN_RESET_PASSWORD: false })
  expect(() => AdminEnvSchema.parse({ ADMIN_RESET_PASSWORD: 'true' })).toThrow()
  expect(() => AdminEnvSchema.parse({ ADMIN_EMAIL: 'admin@example.com', ADMIN_RESET_PASSWORD: 'true' })).toThrow()
})

test('unused S3 credentials are optional but enabled S3 requires each credential', () => {
  expect(parseConfig({ ...base, S3_BUCKET: '', S3_REGION: '', S3_ENDPOINT: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' }).mediaStorage.enabled).toBe(false)
  const s3 = { MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 's3', S3_BUCKET: 'bucket', S3_REGION: 'region', S3_ACCESS_KEY_ID: 'access', S3_SECRET_ACCESS_KEY: 'secret' }
  for (const name of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    expect(() => parseConfig({ ...base, ...s3, [name]: '' })).toThrow(name)
  }
})

test('Prisma configuration validates only the database URL', () => {
  expect(DatabaseEnvSchema.parse({ DATABASE_URL: base.DATABASE_URL })).toEqual({ DATABASE_URL: base.DATABASE_URL })
})

test('production rejects weak and placeholder secrets without including their values', () => {
  for (const secret of ['', 'short', 'a'.repeat(64), 'change-me-0123456789abcdef0123456789abcdef']) {
    try { parseConfig({ ...base, NODE_ENV: 'production', APP_URL: 'https://app.example', CLIENT_SECRET: secret }); throw new Error('accepted') }
    catch (error) {
      expect(String(error)).toContain('CLIENT_SECRET')
      if (secret) expect(String(error)).not.toContain(secret)
    }
  }
})
