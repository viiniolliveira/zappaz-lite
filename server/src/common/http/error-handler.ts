import { logger } from '@lib/logger'
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import { AppError } from '../errors/app-error.ts'
import { ConflictError } from '../errors/conflict-error.ts'
import { ERROR_CODES } from '../errors/error-codes.ts'
import { NotFoundError } from '../errors/not-found-error.ts'
import { RangeNotSatisfiableError } from '../errors/range-not-satisfiable-error.ts'
import { ValidationError } from '../errors/validation-error.ts'

function mapPrismaError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }

  const { code } = error as { code: string }
  if (code === 'P2025') return new NotFoundError('Resource not found')
  if (code === 'P2002') {
    return new ConflictError('A resource with the same unique fields already exists', error)
  }
  return null
}

function logError(error: Error, c: Context, status: number) {
  const entry = {
    msg: 'HTTP request failed',
    err: error,
    extra: {
      method: c.req.method,
      path: c.req.path,
      status,
    },
  }

  if (status >= 500) logger.error(entry)
  else logger.warn(entry)
}

function appErrorResponse(error: AppError, c: Context) {
  logError(error, c, error.status)
  return c.json(
    {
      ok: false,
      error: { code: error.code, message: error.message },
    },
    error.status,
  )
}

export function errorHandler(error: Error, c: Context) {
  if (error instanceof RangeNotSatisfiableError) {
    c.header('Content-Range', `bytes */${error.size}`)
    c.header('Cache-Control', 'private, no-store')
  }
  if (error instanceof AppError) return appErrorResponse(error, c)

  if (error instanceof SyntaxError) {
    return appErrorResponse(new ValidationError('Invalid JSON in request body', error), c)
  }

  if (error instanceof ZodError) {
    logError(error, c, 400)
    return c.json(
      {
        ok: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid request data',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      },
      400,
    )
  }

  const prismaError = mapPrismaError(error)
  if (prismaError) return appErrorResponse(prismaError, c)

  if (error instanceof HTTPException) {
    logError(error, c, error.status)
    return c.json(
      {
        ok: false,
        error: {
          code: ERROR_CODES.INTERNAL_SERVER_ERROR,
          message: error.message,
        },
      },
      error.status,
    )
  }

  logError(error, c, 500)
  return c.json(
    {
      ok: false,
      error: {
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    },
    500,
  )
}
