import { createRouter } from '@server/create-app'
import { auth } from '@server/lib/auth.ts'
import { bodyLimit } from 'hono/body-limit'

const authRouter = createRouter()
authRouter.use('/api/auth/*', bodyLimit({ maxSize: 16 * 1024 }))

authRouter.all('/api/auth/*', (c) => {
  const headers = new Headers(c.req.raw.headers)
  headers.delete('x-zappaz-client-ip')
  if (c.env?.clientIp) headers.set('x-zappaz-client-ip', c.env.clientIp)
  return auth.handler(
    new Request(c.req.url, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
    }),
  )
})

export default authRouter
