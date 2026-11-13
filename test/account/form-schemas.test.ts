import { describe, expect, test } from 'bun:test'
import { passwordSchema, profileSchema } from '../../src/components/account/form-schemas.ts'

const profile = { firstName: 'Maria', lastName: 'Silva', email: 'maria@example.com', phone: '+5511999999999' }

describe('account form validation', () => {
  test('accepts a valid profile and rejects missing names and invalid contact information', () => {
    expect(profileSchema.safeParse(profile).success).toBe(true)
    expect(profileSchema.parse({ ...profile, firstName: ' Maria ', lastName: ' Silva ' })).toEqual(profile)
    for (const invalid of [
      { ...profile, firstName: '' },
      { ...profile, firstName: '   ' },
      { ...profile, lastName: '' },
      { ...profile, email: 'not-an-email' },
      { ...profile, phone: '' },
      { ...profile, phone: '+123' },
    ]) expect(profileSchema.safeParse(invalid).success).toBe(false)
  })

  test('requires the current password, at least eight characters and matching confirmation', () => {
    expect(passwordSchema.safeParse({ currentPassword: 'old', password: '12345678', confirmPassword: '12345678' }).success).toBe(true)
    const withSpaces = { currentPassword: ' old ', password: ' new pass ', confirmPassword: ' new pass ' }
    expect(passwordSchema.parse(withSpaces)).toEqual(withSpaces)
    for (const invalid of [
      { currentPassword: '', password: '12345678', confirmPassword: '12345678' },
      { currentPassword: 'old', password: '1234567', confirmPassword: '1234567' },
      { currentPassword: 'old', password: '12345678', confirmPassword: 'different' },
      { currentPassword: 'old', password: '12345678', confirmPassword: '' },
    ]) expect(passwordSchema.safeParse(invalid).success).toBe(false)
  })
})
