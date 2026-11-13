import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { ErrorCode } from './error-codes.ts'

interface AppErrorOptions {
  code: ErrorCode
  message: string
  status: ContentfulStatusCode
  cause?: unknown
}

export class AppError extends HTTPException {
  readonly code: ErrorCode

  constructor({ code, message, status, cause }: AppErrorOptions) {
    super(status, { message, cause })
    this.code = code
  }
}
