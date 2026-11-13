import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { errorHandler } from '../../server/src/common/http/error-handler.ts'
import { mediaResponse } from '../../server/src/lib/chat-media-response.ts'

const file = { bytes: new TextEncoder().encode('abcdef'), mimeType: 'image/png', fileName: 'a"/\\\n.png' }
const app = new Hono()
app.onError(errorHandler)
app.get('/', (c) => mediaResponse(file, c.req.header('range')))

describe('media HTTP response', () => {
  test('returns the complete file with safe headers', async () => {
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('abcdef')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('6')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''a____.png")
  })
  test.each([['bytes=1-3', 'bcd', 'bytes 1-3/6'], ['bytes=4-', 'ef', 'bytes 4-5/6'], ['bytes=-2', 'ef', 'bytes 4-5/6'], ['bytes=3-99', 'def', 'bytes 3-5/6']])('%s returns partial content', async (range, body, contentRange) => {
    const response = await app.request('/', { headers: { range } })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(contentRange)
    expect(response.headers.get('content-length')).toBe(String(body.length))
    expect(await response.text()).toBe(body)
  })
  test.each(['bytes=6-', 'bytes=-0', 'bytes=3-2', 'bytes=-', 'bytes=0-1,3-4', 'items=0-1', 'bytes=9007199254740992-'])('%s returns 416 through the error handler', async (range) => {
    const response = await app.request('/', { headers: { range } })
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */6')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ ok: false, error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Invalid byte range' } })
  })
  test.each(['text/html', 'image/svg+xml', null])('forces attachment for %s', (mimeType) => {
    const response = mediaResponse({ ...file, mimeType, fileName: 'é.html' })
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''%C3%A9.html")
  })
  test('sanitizes audio MIME parameters and serves audio inline', async () => {
    const response = mediaResponse({ ...file, mimeType: 'audio/ogg; codecs=opus', fileName: 'voice.ogg' })
    expect(response.headers.get('content-type')).toBe('audio/ogg')
    expect(response.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''voice.ogg")
    expect(await response.text()).toBe('abcdef')
  })
  test('empty content returns 200 without range and 416 with one', async () => {
    expect(mediaResponse({ ...file, bytes: new Uint8Array() }).headers.get('content-length')).toBe('0')
    const empty = new Hono().onError(errorHandler).get('/', (c) => mediaResponse({ ...file, bytes: new Uint8Array() }, c.req.header('range')))
    const response = await empty.request('/', { headers: { range: 'bytes=0-' } })
    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */0')
  })
})
