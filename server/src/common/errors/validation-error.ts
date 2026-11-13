import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class ValidationError extends AppError {
  constructor(message = 'Invalid data', cause?: unknown) {
    super({ code: ERROR_CODES.VALIDATION_ERROR, message, status: 400, cause })
  }
}
