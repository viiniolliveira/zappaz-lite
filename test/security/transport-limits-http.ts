import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

mock.module('@server/lib/auth.ts', () => ({
  auth: { handler: async (request: Request) => new Response(await request.text()) },
}))
mock.module('@lib/logger', () => ({ logger: { warn() {}, error() {}, info() {} } }))
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { config } = await import('../../server/src/config.ts')
const { default: authRouter } = await import('../../server/src/modules/auth/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', authRouter)
app.post('/private', (c) => c.text('unauthorized', 401))
app.post('/read', async (c) => c.text(String((await c.req.arrayBuffer()).byteLength)))
app.post('/partial', async (c) => {
  await c.req.raw.body?.getReader().read()
  return c.text('done')
})

function stream(bytes: number, onPull = () => {}) {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        onPull()
        controller.enqueue(new Uint8Array(bytes))
        controller.close()
      },
    },
    { highWaterMark: 0 },
  )
}
function request(path: string, body: ReadableStream<Uint8Array>, length?: number) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body,
    ...(length === undefined ? {} : { headers: { 'content-length': String(length) } }),
  })
}
let pulls = 0
assert.equal(
  (
    await app.fetch(
      request(
        '/private',
        stream(10, () => pulls++),
      ),
    )
  ).status,
  401,
)
assert.equal(pulls, 0, 'unauthorized requests must not consume the body')
pulls = 0
assert.equal(
  (
    await app.fetch(
      request(
        '/read',
        stream(1, () => pulls++),
        config.mediaRequestBodyBytes + 1,
      ),
    )
  ).status,
  413,
)
assert.equal(pulls, 0, 'oversized content-length must be rejected before reading')
assert.equal(
  (await app.fetch(request('/read', stream(config.mediaRequestBodyBytes + 1)))).status,
  413,
)
assert.equal(
  (await app.fetch(request('/read', stream(config.mediaRequestBodyBytes + 1), 1))).status,
  413,
)
const boundary = await app.fetch(request('/read', stream(config.mediaRequestBodyBytes)))
assert.equal(boundary.status, 200)
assert.equal(await boundary.text(), String(config.mediaRequestBodyBytes))
assert.equal((await app.fetch(request('/api/auth/sign-in/email', stream(16384)))).status, 200)
assert.equal((await app.fetch(request('/api/auth/sign-in/email', stream(16385)))).status, 413)
assert.equal((await app.fetch(request('/api/auth/sign-in/email', stream(16385), 1))).status, 413)

let entered = 0
let allEntered!: () => void
const ready = new Promise<void>((resolve) => {
  allEntered = resolve
})
const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
function heldStream() {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controllers.push(controller)
        entered++
        if (entered === 4) allEntered()
        return new Promise<void>((resolve) => {
          finish.push(resolve)
        })
      },
    },
    { highWaterMark: 0 },
  )
}
const finish: (() => void)[] = []
const held = Array.from({ length: 4 }, () => app.fetch(request('/read', heldStream())))
await ready
try {
  assert.equal((await app.fetch(request('/read', stream(1)))).status, 429)
} finally {
  for (const controller of controllers) {
    controller.enqueue(new Uint8Array(1))
    controller.close()
  }
  for (const resolve of finish) resolve()
}
assert.deepEqual(
  (await Promise.all(held)).map((response) => response.status),
  Array(4).fill(200),
)
assert.equal((await app.fetch(request('/read', stream(1)))).status, 200)
let canceled = false
const partial = new ReadableStream<Uint8Array>(
  {
    pull(controller) {
      controller.enqueue(new Uint8Array(1))
    },
    cancel() {
      canceled = true
    },
  },
  { highWaterMark: 0 },
)
assert.equal((await app.fetch(request('/partial', partial))).status, 200)
assert.equal(canceled, true)
const failed = new ReadableStream<Uint8Array>(
  {
    pull(controller) {
      controller.error(new Error('synthetic stream error'))
    },
  },
  { highWaterMark: 0 },
)
assert.equal((await app.fetch(request('/read', failed))).status, 500)
assert.equal((await app.fetch(request('/read', stream(1)))).status, 200)
