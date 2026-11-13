import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

const id = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'
const requestId = '00000000-0000-4000-8000-000000000003'
const date = new Date('2025-01-01T00:00:00Z')
const row = { id, sessionId: 's', conversationId, messageId: 'wa-id', clientRequestId: requestId, fromMe: true, senderJid: null, senderName: null, type: 'text', text: 'hello', hasLink: false, status: null, sentAt: null, orderAt: date, createdAt: date, updatedAt: date, editedAt: null, deletedAt: null, revision: 1, content: {}, media: null }
let enabled = true, connected = true, foundConversation = true, foundQuote = true, saved = true
let result: { key: { id: string } } | undefined = { key: { id: 'wa-id' } }
let calls: unknown[][] = []
let quoteWhere: unknown
const prisma = {
  waConversation: { findFirst: async () => foundConversation ? { jid: '123@s.whatsapp.net' } : null },
  waMessage: { findFirst: async (query: { where: { deletedAt?: null } }) => {
    if ('deletedAt' in query.where) { quoteWhere = query.where; return foundQuote ? { messageId: 'quoted-wa' } : null }
    return row
  } },
}
mock.module('../../server/src/db/prisma.ts', () => ({ prisma }))
mock.module('../../server/src/lib/chat-media.ts', () => ({ retrieveChatMedia: async () => null }))
let deletions = 0
mock.module('../../server/src/lib/chat-store.ts', () => ({ findLegacyMessage: async () => saved ? { id } : null, chatTransaction: async () => {}, privateJid: () => true, updateChatMessage: async () => { deletions++ } }))
mock.module('../../server/src/services/whatsapp.ts', () => ({ whatsappService: {
  isSessionEnabled: () => enabled,
  isSessionConnected: () => connected,
  sendChatMessage: async (...args: unknown[]) => { calls.push(args); return result },
  deleteMessageForEveryone: async (...args: unknown[]) => { calls.push(args); return result },
} }))
const pass = async (_c: unknown, next: () => Promise<void>) => next()
mock.module('../../server/src/middleware/auth.ts', () => ({ requireSession: pass, requireSessionAuth: pass }))
mock.module('../../server/src/middleware/rate-limiter.ts', () => ({ rateLimiter: pass }))

const { SendTextSchema, SendMediaSchema } = await import('../../server/src/modules/conversation-messages/schema.ts')
const { sendChatText, sendChatMedia } = await import('../../server/src/modules/conversation-messages/send-service.ts')
const { default: router } = await import('../../server/src/modules/conversation-messages/route.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
router.onError(errorHandler)
const text = { text: 'hello', clientRequestId: requestId }
const file = new File(['plain data'], 'note.txt', { type: 'image/jpeg' })
const media = { file, kind: 'document' as const, voice: 'false' as const, clientRequestId: requestId }
for (const invalid of [{ ...text, extra: 1 }, { ...text, text: '  ' }, { ...text, text: 'x'.repeat(4097) }, { ...text, clientRequestId: 'bad' }, { ...text, replyToMessageRecordId: 'bad' }]) assert.equal(SendTextSchema.safeParse(invalid).success, false)
assert.equal(SendTextSchema.safeParse({ ...text, replyToMessageRecordId: null }).success, true)
assert.equal(SendMediaSchema.parse({ ...media, voice: undefined }).voice, 'false')
for (const invalid of [{ ...media, extra: 1 }, { ...media, file: 'not-file' }, { ...media, kind: 'sticker' }, { ...media, voice: 'true' }, { ...media, caption: 'x'.repeat(4097) }, { ...media, clientRequestId: 'bad' }]) assert.equal(SendMediaSchema.safeParse(invalid).success, false)

const dto = await sendChatText('s', conversationId, { ...text, replyToMessageRecordId: id })
assert.equal(dto.clientRequestId, requestId)
assert.equal(dto.id, id)
assert.deepEqual(quoteWhere, { sessionId: 's', conversationId, id, deletedAt: null })
assert.deepEqual(calls.at(-1), ['s', '123@s.whatsapp.net', { text: 'hello', linkPreview: undefined }, 'text', requestId, 'quoted-wa', { ...text, replyToMessageRecordId: id }])
const signedText = { ...text, signMessage: true, signatureName: 'Alice' }
await sendChatText('s', conversationId, signedText)
assert.deepEqual(calls.at(-1), ['s', '123@s.whatsapp.net', { text: 'hello', linkPreview: undefined }, 'text', requestId, undefined, signedText])
async function rejectsCode(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === code)
}
const sendText = () => sendChatText('s', conversationId, text)
foundQuote = false
await rejectsCode(() => sendChatText('s', conversationId, { ...text, replyToMessageRecordId: id }), 'NOT_FOUND')
foundQuote = true
foundConversation = false; await rejectsCode(sendText, 'NOT_FOUND'); foundConversation = true
enabled = false; await rejectsCode(sendText, 'SESSION_NOT_ENABLED'); enabled = true
connected = false; await rejectsCode(sendText, 'SESSION_NOT_CONNECTED'); connected = true
result = undefined; await rejectsCode(sendText, 'INTERNAL_SERVER_ERROR'); result = { key: { id: 'wa-id' } }
saved = false; await rejectsCode(sendText, 'INTERNAL_SERVER_ERROR'); saved = true
const count = calls.length
await rejectsCode(() => sendChatMedia('s', conversationId, { ...media, file: new File([], 'empty') }), 'UNSUPPORTED_MEDIA_TYPE')
await rejectsCode(() => sendChatMedia('s', conversationId, { ...media, file: new File([new Uint8Array(1024 * 1024 + 1)], 'big') }), 'PAYLOAD_TOO_LARGE')
await rejectsCode(() => sendChatMedia('s', conversationId, { ...media, kind: 'image' }), 'UNSUPPORTED_MEDIA_TYPE')
await rejectsCode(() => sendChatMedia('s', conversationId, { ...media, kind: 'audio', voice: 'true' }), 'UNSUPPORTED_MEDIA_TYPE')
assert.equal(calls.length, count)
await sendChatMedia('s', conversationId, { ...media, file: new File([new Uint8Array(1024 * 1024)], 'boundary.bin') })
await sendChatMedia('s', conversationId, media)
assert.equal(calls.at(-1)?.[6], undefined)
const content = calls.at(-1)?.[2] as { mimetype: string, fileName: string }
assert.equal(content.mimetype, 'application/octet-stream')
assert.equal(content.fileName, 'note.txt')

const base = `/api/v1/session/s/conversations/${conversationId}/messages`
row.fromMe = false
assert.equal((await router.request(`${base}/${id}`, { method: 'DELETE' })).status, 403)
assert.equal(deletions, 0)
row.fromMe = true
result = undefined
assert.equal((await router.request(`${base}/${id}`, { method: 'DELETE' })).status, 502)
assert.equal(deletions, 0)
result = { key: { id: 'wa-delete' } }
assert.equal((await router.request(`${base}/${id}`, { method: 'DELETE' })).status, 200)
assert.equal(deletions, 1)
assert.deepEqual(calls.at(-1), ['s', 'wa-id', { id: 'wa-id', remoteJid: '123@s.whatsapp.net', fromMe: true }])
connected = false
assert.equal((await router.request(`${base}/${id}`, { method: 'DELETE' })).status, 409)
connected = true
foundConversation = false
assert.equal((await router.request(`${base}/${id}`, { method: 'DELETE' })).status, 404)
foundConversation = true
result = { key: { id: 'wa-id' } }
const postText = (body: unknown) => router.request(`${base}/text`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
let response = await postText(text)
assert.equal(response.status, 201)
let json = await response.json() as { status?: string, data?: { clientRequestId: string }, error?: { code: string } }
assert.equal(json.status, 'success'); assert.equal(json.data?.clientRequestId, requestId)
response = await postText({ ...text, extra: true }); assert.equal(response.status, 400)
result = undefined
response = await postText(text); json = await response.json() as typeof json
assert.equal(response.status, 500); assert.notEqual(json.status, 'success'); assert.equal(json.error?.code, 'INTERNAL_SERVER_ERROR')
result = { key: { id: 'wa-id' } }
const form = new FormData()
form.set('file', file); form.set('kind', 'document'); form.set('clientRequestId', requestId)
response = await router.request(`${base}/media`, { method: 'POST', body: form })
assert.equal(response.status, 201)
json = await response.json() as typeof json
assert.equal(json.status, 'success'); assert.equal(json.data?.clientRequestId, requestId)
for (const size of [1024 * 1024, 1024 * 1024 + 1]) {
  const boundaryForm = new FormData()
  boundaryForm.set('file', new File([new Uint8Array(size)], 'boundary.bin'))
  boundaryForm.set('kind', 'document'); boundaryForm.set('clientRequestId', requestId)
  const boundaryResponse = await router.request(`${base}/media`, { method: 'POST', body: boundaryForm })
  assert.equal(boundaryResponse.status, size === 1024 * 1024 ? 201 : 413)
}
response = await router.request(`${base}/media`, { method: 'POST', headers: { 'content-length': String(2 * 1024 * 1024 + 1) }, body: 'x' })
assert.equal(response.status, 413)
form.set('extra', 'unexpected')
response = await router.request(`${base}/media`, { method: 'POST', body: form }); assert.equal(response.status, 400)

connected = false
response = await postText(text); json = await response.json() as typeof json
assert.equal(response.status, 409); assert.equal(json.error?.code, 'SESSION_NOT_CONNECTED')
connected = true
const invalidForm = new FormData()
invalidForm.set('file', new File([], 'empty')); invalidForm.set('kind', 'document'); invalidForm.set('clientRequestId', requestId)
response = await router.request(`${base}/media`, { method: 'POST', body: invalidForm })
assert.equal(response.status, 415)
assert.equal((await response.json() as typeof json).error?.code, 'UNSUPPORTED_MEDIA_TYPE')

if (Bun.which('ffmpeg') && Bun.which('ffprobe')) {
  const encoder = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-c:a', 'libopus', '-f', 'ogg', 'pipe:1'], { stdout: 'pipe', stderr: 'pipe' })
  const bytes = await new Response(encoder.stdout).arrayBuffer()
  assert.equal(await encoder.exited, 0)
  const voiceFile = new File([bytes], 'voice.ogg', { type: 'audio/ogg' })
  await sendChatMedia('s', conversationId, { ...media, file: voiceFile, kind: 'audio', voice: 'false' })
  const audio = calls.at(-1)?.[2] as { ptt: boolean; audio: Buffer; mimetype: string }
  assert.equal(audio.ptt, false)
  assert.equal(audio.mimetype, 'audio/ogg; codecs=opus')
  assert.deepEqual(audio.audio, Buffer.from(bytes))
  await sendChatMedia('s', conversationId, { ...media, file: voiceFile, kind: 'audio', voice: 'true' })
  const voice = calls.at(-1)?.[2] as { ptt: boolean; audio: Buffer; mimetype: string }
  assert.equal(voice.ptt, false)
  assert.equal(voice.mimetype, 'audio/mpeg')
  async function assertMp3(audioBytes: Buffer) {
    const probe = Bun.spawn(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate:format=format_name', '-of', 'json', 'pipe:0'], { stdin: new Blob([audioBytes]), stdout: 'pipe', stderr: 'pipe' })
    const info = await new Response(probe.stdout).json() as { streams: { codec_name: string; channels: number; sample_rate: string }[]; format: { format_name: string } }
    assert.equal(await probe.exited, 0)
    assert.deepEqual(info.streams[0], { codec_name: 'mp3', sample_rate: '48000', channels: 1 })
    assert.equal(info.format.format_name, 'mp3')
  }
  await assertMp3(voice.audio)
  const voiceForm = new FormData()
  voiceForm.set('file', voiceFile); voiceForm.set('kind', 'audio'); voiceForm.set('voice', 'true'); voiceForm.set('clientRequestId', requestId)
  response = await router.request(`${base}/media`, { method: 'POST', body: voiceForm })
  assert.equal(response.status, 201)
  const forwarded = calls.at(-1)?.[2] as { ptt: boolean; audio: Buffer; mimetype: string }
  assert.equal(forwarded.ptt, false)
  assert.equal(forwarded.mimetype, 'audio/mpeg')
  await assertMp3(forwarded.audio)
  const mp3Encoder = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.1', '-c:a', 'libmp3lame', '-f', 'mp3', 'pipe:1'], { stdout: 'pipe', stderr: 'pipe' })
  const mp3Bytes = await new Response(mp3Encoder.stdout).arrayBuffer()
  assert.equal(await mp3Encoder.exited, 0)
  await sendChatMedia('s', conversationId, { ...media, file: new File([mp3Bytes], 'audio.mp3', { type: 'audio/mpeg' }), kind: 'audio', voice: 'false' })
  const attachment = calls.at(-1)?.[2] as { ptt: boolean; audio: Buffer; mimetype: string }
  assert.equal(attachment.ptt, false)
  assert.equal(attachment.mimetype, 'audio/mpeg')
  assert.deepEqual(attachment.audio, Buffer.from(mp3Bytes))
  const corrupt = new File([bytes.slice(0, 64)], 'corrupt.ogg', { type: 'audio/ogg' })
  await rejectsCode(() => sendChatMedia('s', conversationId, { ...media, file: corrupt, kind: 'audio', voice: 'true' }), 'UNSUPPORTED_MEDIA_TYPE')
}
