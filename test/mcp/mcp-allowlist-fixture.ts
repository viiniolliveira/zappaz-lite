import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'

// The route's real validation and authentication middleware are retained. A
// controller stub prevents unrelated WhatsApp services from being initialized.
mock.module('@db/prisma', () => ({ prisma: {} }))
mock.module(
  fileURLToPath(new URL('../../server/src/modules/mcp/controller.ts', import.meta.url)),
  () => ({
    mcpController: () => new Response('controller reached'),
  }),
)
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/mcp/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)

async function status(host: string, origin?: string) {
  const headers: Record<string, string> = {
    host,
    'x-zappaz-preset': 'session',
    'x-zappaz-session-id': 'a',
  }
  if (origin) headers.origin = origin
  return (
    await app.request('http://localhost/mcp', {
      method: 'POST',
      headers,
    })
  ).status
}
// 401 proves both origin checks passed and authentication rejected the absent token.
assert.equal(await status('custom.example:8080', 'https://custom.example:8080'), 401)
assert.equal(await status('custom.example:8080'), 401)
assert.equal(await status('localhost', 'https://custom.example:8080'), 403)
assert.equal(await status('custom.example:8080', 'http://localhost:5173'), 403)
assert.equal(await status('evil.example', 'https://custom.example:8080'), 403)
assert.equal(await status('custom.example:8080', 'https://evil.example'), 403)
