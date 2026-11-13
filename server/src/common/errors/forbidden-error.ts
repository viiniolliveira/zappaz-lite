import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super({ code: ERROR_CODES.FORBIDDEN, message, status: 403 })
  }
}
