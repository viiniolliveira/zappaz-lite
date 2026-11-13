import { describe, expect, test } from 'bun:test'
import { allowedAppOrigins, parseAppUrl } from '../../server/src/lib/app-url.ts'

describe('application URL', () => {
  test('defaults to the Vite origin only outside production', () => {
    expect(parseAppUrl(undefined, false)).toBe('http://localhost:5173')
    expect(() => parseAppUrl(undefined, true)).toThrow()
  })

  test('normalizes a trailing slash and retains a non-default port', () => {
    expect(parseAppUrl('https://example.com:8443/', true)).toBe('https://example.com:8443')
    expect(parseAppUrl('http://localhost:3001/', false)).toBe('http://localhost:3001')
  })

  test.each(['', 'invalid', 'ftp://example.com', 'https://example.com/path', 'https://example.com?x=1', 'https://example.com#fragment', 'https://example.com?', 'https://example.com#', 'https://example.com/path/..', 'https://user:password@example.com', 'https://example.com,https://other.example'])('rejects an invalid origin: %s', (value) => {
    expect(() => parseAppUrl(value, false)).toThrow()
  })

  test('requires HTTPS in production', () => {
    expect(() => parseAppUrl('http://example.com', true)).toThrow()
    expect(parseAppUrl('https://example.com', true)).toBe('https://example.com')
  })

  test('limits production to the configured origin', () => {
    expect(allowedAppOrigins('https://example.com', true)).toEqual(['https://example.com'])
  })

  test('adds and deduplicates local development origins', () => {
    expect(new Set(allowedAppOrigins('http://localhost:5173', false))).toEqual(new Set([
      'http://localhost:3001', 'http://localhost:5173',
      'http://127.0.0.1:3001', 'http://127.0.0.1:5173',
    ]))
    expect(allowedAppOrigins('http://localhost:5173', false)).toHaveLength(4)
    expect(allowedAppOrigins('https://app.example', false)).toContain('https://app.example')
  })
})
