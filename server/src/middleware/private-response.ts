import { createMiddleware } from 'hono/factory'

export const privateResponse = createMiddleware(async (c, next) => {
  const privatePath =
    /^\/(api|admin|mcp)(\/|$)/.test(c.req.path) || ['/docs', '/openapi.json'].includes(c.req.path)
  const credentials = ['cookie', 'authorization', 'x-api-key'].some(
    (header) => c.req.header(header) !== undefined,
  )
  if (privatePath || credentials) {
    c.header('Cache-Control', 'private, no-store')
    c.header('Pragma', 'no-cache')
    await next()
    c.header('Cache-Control', 'private, no-store')
    return
  }
  await next()
})
