import { expect, test } from 'bun:test'
import { createConcurrencyLimit } from '../../server/src/lib/resource-limit.ts'
import { PageSchema, PageSizeSchema } from '../../server/src/common/pagination.ts'
import { WebhookHeadersSchema } from '../../server/src/common/webhook-headers.ts'

test('capacity rejects excess work and releases exactly once', () => {
  const acquire = createConcurrencyLimit(1)
  const release = acquire()
  expect(() => acquire()).toThrow('Resource capacity')
  release(); release()
  const next = acquire()
  expect(() => acquire()).toThrow()
  next()
})

test('pagination and webhook headers reject oversized or ambiguous input', () => {
  for (const value of ['0', '-1', '1.5', '1e2', '101', '999999999']) expect(PageSizeSchema.safeParse(value).success).toBe(false)
  expect(PageSchema.safeParse('10001').success).toBe(false)
  expect(PageSizeSchema.parse('100')).toBe('100')
  expect(WebhookHeadersSchema.safeParse({ Host: 'internal' }).success).toBe(false)
  expect(WebhookHeadersSchema.safeParse({ Authorization: 'test\r\nInjected: yes' }).success).toBe(false)
  expect(WebhookHeadersSchema.safeParse({ Authorization: 'synthetic' }).success).toBe(true)
})
