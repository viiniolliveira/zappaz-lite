import { AppError } from './app-error.ts'
export class RangeNotSatisfiableError extends AppError {
  constructor(readonly size: number) {
    super({
      status: 416,
      code: 'RANGE_NOT_SATISFIABLE',
      message: 'Invalid byte range',
    })
  }
}
