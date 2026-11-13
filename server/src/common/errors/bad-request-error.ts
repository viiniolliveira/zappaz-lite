import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request', cause?: unknown) {
    super({ code: ERROR_CODES.BAD_REQUEST, message, status: 400, cause })
  }
}
