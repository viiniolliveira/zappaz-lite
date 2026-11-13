import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { AppError } from '../../server/src/common/errors/app-error.ts'

let message: { id: string; conversationId: string } | null = { id: 'internal', conversationId: 'conversation' }
let media: { id: string } | null = { id: 'media-id' }
let file: { bytes: Buffer; mimeType: string | null; fileName: string | null } = { bytes: Buffer.from('example'), mimeType: 'image/png', fileName: 'image.png' }
let ambiguous = false
const calls: unknown[] = []
const debug: unknown[] = []
const ambiguity = new AppError({ status: 409, code: 'AMBIGUOUS_MESSAGE_ID', message: 'Ambiguous message' })
mock.module('@db/prisma', () => ({ prisma: { globalWebhook: { findMany: async () => [] }, waMessageMedia: { findUnique: async (input: unknown) => { calls.push(['findUnique', input]); return media } } } }))
mock.module('../../server/src/lib/chat-store.ts', () => ({ findLegacyMessage: async (session: string, id: string) => { calls.push(['findLegacyMessage', session, id]); if (ambiguous) throw ambiguity; return message }, updateChatMessage: async () => { throw new Error('Unexpected message update in media retrieval') } }))
mock.module('../../server/src/lib/chat-media.ts', () => ({ retrieveChatMedia: async (...args: unknown[]) => { calls.push(['retrieveChatMedia', ...args]); return file } }))
mock.module('@lib/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {}, debug: (entry: unknown) => debug.push(entry) } }))
mock.module('@lib/utils', () => ({ getLocationFromAddress: () => {}, waitUntil: () => {}, getMimeTypeFromBase64: async () => { throw new Error('unknown MIME') } }))
mock.module('@lib/whatsapp-session', () => ({ WhatsappSession: class { constructor() { throw new Error('Unexpected socket session') } } }))
const { whatsappService } = await import('../../server/src/services/whatsapp.ts')
mock.module('../../server/src/modules/whatsapp-messages/query-service.ts', () => ({
  getMessages: async () => { throw new Error('Unexpected message listing in media fixture') },
  getMessageById: async () => { throw new Error('Unexpected message lookup in media fixture') },
}))
const get = () => whatsappService.getMessageMedia('session', 'wa-id')

assert.deepEqual(await get(), { media: 'ZXhhbXBsZQ==', mimeType: 'image/png', fileName: 'image.png' })
assert.deepEqual(calls, [['findLegacyMessage', 'session', 'wa-id'], ['findUnique', { where: { messageId: 'internal' } }], ['retrieveChatMedia', 'session', 'conversation', 'media-id', false]])
assert.equal(debug.length, 0)

file = { bytes: Buffer.from('unknown'), mimeType: null, fileName: null }
assert.deepEqual(await get(), { media: 'dW5rbm93bg==', mimeType: null, fileName: null })
assert.equal(debug.length, 1)
assert.match(JSON.stringify(debug[0]), /Media MIME type is unknown/)

calls.length = 0
message = null
assert.equal(await get(), null)
assert.deepEqual(calls, [['findLegacyMessage', 'session', 'wa-id']])

const next = (_c: Context, next: Next) => next()
mock.module('@middleware/auth', () => ({ requireSession: next, requireSessionAuth: next }))
mock.module('@middleware/rate-limiter', () => ({ rateLimiter: next }))
mock.module('@middleware/session', () => ({ requireConnectedSession: next, requireEnabledSession: next }))
mock.module('../../server/src/modules/docs/openapi.ts', () => ({ describeApiRoute: () => next }))
const { default: router } = await import('../../server/src/modules/whatsapp-messages/route.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const routeApp = new Hono().onError(errorHandler).route('/', router)
const path = '/api/v1/session/session/message/wa-id/media'
ambiguous = false
message = { id: 'internal', conversationId: 'conversation' }
media = { id: 'media-id' }
file = { bytes: Buffer.from('abcdef'), mimeType: 'image/png', fileName: 'image.png' }
const base64Response = await routeApp.request(`${path}/base64`)
assert.equal(base64Response.status, 200)
assert.deepEqual(await base64Response.json(), { status: 'success', data: { media: 'YWJjZGVm', mimeType: 'image/png', fileName: 'image.png' } })
const binaryResponse = await routeApp.request(`${path}/binary`)
assert.equal(binaryResponse.status, 200)
assert.equal(await binaryResponse.text(), 'abcdef')
assert.equal(binaryResponse.headers.get('content-type'), 'image/png')
assert.equal(binaryResponse.headers.get('accept-ranges'), 'bytes')
const partial = await routeApp.request(`${path}/binary`, { headers: { range: 'bytes=1-3' } })
assert.equal(partial.status, 206)
assert.equal(await partial.text(), 'bcd')
assert.equal(partial.headers.get('content-range'), 'bytes 1-3/6')
const invalidRange = await routeApp.request(`${path}/binary`, { headers: { range: 'bytes=6-' } })
assert.equal(invalidRange.status, 416)
assert.equal(invalidRange.headers.get('content-range'), 'bytes */6')
assert.equal((await routeApp.request(path)).status, 404)
for (const format of ['base64', 'binary']) {
  message = null
  assert.equal((await routeApp.request(`${path}/${format}`)).status, 404)
  message = { id: 'internal', conversationId: 'conversation' }
  media = null
  assert.equal((await routeApp.request(`${path}/${format}`)).status, 404)
  media = { id: 'media-id' }
  ambiguous = true
  assert.equal((await routeApp.request(`${path}/${format}`)).status, 409)
  ambiguous = false
}
message = { id: 'internal', conversationId: 'conversation' }
media = null; calls.length = 0
assert.equal(await get(), null)
assert.deepEqual(calls, [['findLegacyMessage', 'session', 'wa-id'], ['findUnique', { where: { messageId: 'internal' } }]])
ambiguous = true; calls.length = 0
await assert.rejects(get(), (error: unknown) => error === ambiguity && error.status === 409)
assert.deepEqual(calls, [['findLegacyMessage', 'session', 'wa-id']])
