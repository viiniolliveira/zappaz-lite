import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super({ code: ERROR_CODES.RATE_LIMITED, message, status: 429 })
  }
}
