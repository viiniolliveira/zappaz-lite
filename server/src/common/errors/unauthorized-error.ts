import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super({ code: ERROR_CODES.UNAUTHORIZED, message, status: 401 })
  }
}
