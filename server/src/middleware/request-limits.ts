import { createMiddleware } from 'hono/factory'
import { AppError } from '../common/errors/app-error.ts'
import { config } from '../config.ts'
import type { AppEnv } from '../create-app.ts'
import { createConcurrencyLimit } from '../lib/resource-limit.ts'

const acquireBodyReader = createConcurrencyLimit(4)

export const requestLimits = createMiddleware<AppEnv>(async (c, next) => {
  const body = c.req.raw.body
  if (!body) return next()
  const maxSize = c.req.path.startsWith('/api/auth/') ? 16 * 1024 : config.mediaRequestBodyBytes
  const tooLarge = () =>
    new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the configured request limit',
    })
  const length = c.req.header('content-length')
  if (length && Number(length) > maxSize) throw tooLarge()

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let release: (() => void) | undefined
  let size = 0
  let limitError: AppError | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  // No pre-buffering: authentication and route admission run before the first read.
  const limited = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (!reader) {
          release = acquireBodyReader()
          reader = body.getReader()
          deadline = setTimeout(() => {
            limitError = new AppError({
              status: 408,
              code: 'REQUEST_TIMEOUT',
              message: 'Request body read timed out',
            })
            controller.error(limitError)
          }, 15_000)
        }
        const { done, value } = await reader.read()
        if (limitError) return
        if (done) {
          clearTimeout(deadline)
          release?.()
          controller.close()
          return
        }
        size += value.byteLength
        if (size > maxSize) {
          limitError = tooLarge()
          controller.error(limitError)
          return
        }
        controller.enqueue(value)
      },
    },
    { highWaterMark: 0 },
  )
  c.req.raw = new Request(c.req.raw, { body: limited })
  try {
    await next()
    // A downstream parser must not turn a size violation into a success/500 response.
    if (limitError) throw limitError
  } finally {
    clearTimeout(deadline)
    release?.()
    if (reader) await reader.cancel()
    else await body.cancel()
  }
})
