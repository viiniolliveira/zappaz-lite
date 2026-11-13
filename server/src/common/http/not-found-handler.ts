import type { Context } from 'hono'

import { ERROR_CODES } from '../errors/error-codes.ts'

export function notFoundHandler(c: Context) {
  return c.json(
    {
      ok: false,
      error: {
        code: ERROR_CODES.ROUTE_NOT_FOUND,
        message: 'Route not found',
      },
    },
    404,
  )
}
