import { describe, expect, test } from 'bun:test'

import { AdminSeedSchema } from '../../server/src/db/seed-config.ts'

const credentials = {
  ADMIN_EMAIL: 'admin+seed@example.com',
  ADMIN_PASSWORD: '  dummy!$#@ password  ',
}

describe('admin seed configuration', () => {
  test('accepts valid credentials and preserves punctuation and password whitespace', () => {
    expect(AdminSeedSchema.parse(credentials)).toEqual(credentials)
  })

  test('enforces password lengths from 8 to 128 characters', () => {
    for (const length of [8, 128]) expect(AdminSeedSchema.safeParse({ ...credentials, ADMIN_PASSWORD: 'x'.repeat(length) }).success).toBe(true)
    for (const length of [1, 7, 129]) expect(AdminSeedSchema.safeParse({ ...credentials, ADMIN_PASSWORD: 'x'.repeat(length) }).success).toBe(false)
  })

  test('ignores unrelated environment variables without requiring API configuration', () => {
    const input = { ...credentials, DATABASE_URL: '', CLIENT_SECRET: '', ADMIN_TOKEN: '', UNRELATED: 'fixture' }
    expect(AdminSeedSchema.parse(input)).toEqual(credentials)
    expect(AdminSeedSchema.parse(credentials)).toEqual(credentials)
  })

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['invalid', 'not-an-email'],
  ])('rejects a %s email', (_description, email) => {
    const result = AdminSeedSchema.safeParse({ ...credentials, ADMIN_EMAIL: email })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([['ADMIN_EMAIL']])
  })

  test('rejects a missing password', () => {
    const result = AdminSeedSchema.safeParse({ ADMIN_EMAIL: credentials.ADMIN_EMAIL })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path)).toEqual([['ADMIN_PASSWORD']])
  })

  test('rejects an empty password with the required message', () => {
    const result = AdminSeedSchema.safeParse({ ...credentials, ADMIN_PASSWORD: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(({ path, message }) => ({ path, message }))).toEqual([
        { path: ['ADMIN_PASSWORD'], message: 'Too small: expected string to have >=8 characters' },
      ])
    }
  })
})
