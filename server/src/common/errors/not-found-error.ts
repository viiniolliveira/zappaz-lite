import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super({ code: ERROR_CODES.NOT_FOUND, message, status: 404 })
  }
}
