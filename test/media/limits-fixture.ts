import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { Hono } from 'hono'
import { MediaSourceSchema } from '../../server/src/lib/outbound-policy.ts'
import { requestLimits } from '../../server/src/middleware/request-limits.ts'

mock.module('@server/services/whatsapp', () => ({ default: {} }))
const { getBase64Buffer } = await import('../../server/src/lib/utils.ts')

const max = 1024 * 1024
for (const size of [max - 2, max - 1, max, max + 1, max + 2]) {
  const encoded = Buffer.alloc(size, 42).toString('base64')
  for (const prefix of ['', 'data:application/octet-stream;base64,']) {
    assert.equal(
      MediaSourceSchema.safeParse(prefix + encoded).success,
      size <= max,
      `decoded size ${size}, prefix ${prefix}`,
    )
    if (size <= max) assert.equal(getBase64Buffer(prefix + encoded).length, size)
    else assert.throws(() => getBase64Buffer(prefix + encoded), { code: 'PAYLOAD_TOO_LARGE' })
  }
}
assert.equal(MediaSourceSchema.safeParse('https://example.com/' + 'a'.repeat(2028)).success, true)
assert.equal(MediaSourceSchema.safeParse('https://example.com/' + 'a'.repeat(2029)).success, false)

const app = new Hono()
app.use('*', requestLimits)
app.onError((_error, c) => c.text('too large', 413))
app.post('/', async (c) => c.text(String((await c.req.text()).length)))
const maxBody = 4 * Math.ceil(max / 3) + max
for (const size of [maxBody, maxBody + 1]) {
  const response = await app.request('/', { method: 'POST', body: 'x'.repeat(size) })
  assert.equal(response.status, size === maxBody ? 200 : 413)
}
assert.equal(
  (
    await app.request('/', {
      method: 'POST',
      headers: { 'content-length': String(maxBody + 1) },
      body: 'x',
    })
  ).status,
  413,
)
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(maxBody + 1))
    controller.close()
  },
})
assert.equal(
  (await app.request(new Request('http://localhost/', { method: 'POST', body: stream }))).status,
  413,
)
