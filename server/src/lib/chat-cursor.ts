import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { BadRequestError } from '../common/errors/bad-request-error.ts'
import { config } from '../config.ts'

const CursorSchema = z.object({
  scope: z.string(),
  id: z.string().uuid(),
  value: z.string().nullable(),
})
export function encodeChatCursor(scope: string, id: string, value: string | null) {
  const data = Buffer.from(JSON.stringify({ scope, id, value })).toString('base64url')
  return `${data}.${createHmac('sha256', config.clientSecret).update(data).digest('base64url')}`
}
export function decodeChatCursor(cursor: string | undefined, scope: string) {
  if (!cursor) return null
  try {
    if (cursor.length > 4096) throw new Error('oversized cursor')
    const [data, signature, extra] = cursor.split('.')
    if (!(data && signature) || extra) throw new Error('invalid cursor')
    const actual = Buffer.from(signature, 'base64url')
    const expected = createHmac('sha256', config.clientSecret).update(data).digest()
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error('invalid signature')
    const parsed = CursorSchema.parse(JSON.parse(Buffer.from(data, 'base64url').toString()))
    if (parsed.scope !== scope) throw new Error('invalid scope')
    return parsed
  } catch {
    throw new BadRequestError('Invalid pagination cursor')
  }
}
