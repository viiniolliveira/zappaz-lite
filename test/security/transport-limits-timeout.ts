import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

mock.module('@lib/logger', () => ({ logger: { warn() {}, error() {}, info() {} } }))
const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const app = createApp()
app.onError(errorHandler)
app.post('/read', async (c) => {
  await c.req.text()
  return c.text('ok')
})
const original = globalThis.setTimeout
let deadline: (() => void) | undefined
let entered!: () => void
const ready = new Promise<void>((resolve) => {
  entered = resolve
})
let canceled = false
globalThis.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => {
  if (ms === 15_000) deadline = fn
  return original(fn, ms === 15_000 ? 60_000 : ms, ...args)
}) as typeof setTimeout
try {
  const body = new ReadableStream<Uint8Array>(
    {
      pull() {
        entered()
        return new Promise<void>(() => {})
      },
      cancel() {
        canceled = true
      },
    },
    { highWaterMark: 0 },
  )
  const responsePromise = app.request('/read', { method: 'POST', body })
  await ready
  assert.ok(deadline, 'a 15-second read deadline must be scheduled')
  deadline()
  const response = await responsePromise
  assert.equal(response.status, 408)
  assert.equal((await response.json()).error.code, 'REQUEST_TIMEOUT')
  assert.equal(canceled, true)
  assert.equal((await app.request('/read', { method: 'POST', body: 'after timeout' })).status, 200)
} finally {
  globalThis.setTimeout = original
}
