import { AppError } from './app-error.ts'
import { ERROR_CODES } from './error-codes.ts'

export class ConflictError extends AppError {
  constructor(message = 'Conflict', cause?: unknown) {
    super({ code: ERROR_CODES.CONFLICT, message, status: 409, cause })
  }
}
