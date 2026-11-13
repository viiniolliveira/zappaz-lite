import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mock } from 'bun:test'

let revoked = false
let listener: (change: any) => Promise<void>
let message: any = null
let conversation: any = null
let contact: any = null
const session = { id: 'session-a', userId: 'user-a', enabled: true }
const prisma = {
  user: { findUnique: async ({ where }: any) => where.id === 'user-a' ? { id: 'user-a', role: 'USER' } : where.id === 'admin' ? { id: 'admin', role: 'ADMIN' } : null },
  waSession: { findUnique: async ({ where }: any) => where.id === session.id ? session : where.id === 'session-b' ? { id: 'session-b', userId: 'user-b', enabled: true } : null },
  waContact: { findFirst: async () => contact },
  waConversation: { findFirst: async ({ where }: any) => where.isGroup === false && !conversation?.isGroup && (!where.messages || message?.conversationId === where.id) ? conversation : null },
  waMessage: { findFirst: async ({ where }: any) => where.conversation?.isGroup === false && message?.isGroup ? null : message },
}
mock.module('../../server/src/db/prisma.ts', () => ({ prisma }))
mock.module('@db/prisma', () => ({ prisma }))
mock.module('@server/lib/auth.ts', () => ({ auth: { api: { getSession: async ({ headers }: { headers: Headers }) => {
  const cookie = headers.get('cookie')
  if (revoked || (cookie !== 'session=user' && cookie !== 'session=admin')) return null
  return { user: { id: cookie === 'session=admin' ? 'admin' : 'user-a' } }
}, verifyApiKey: async ({ body }: { body: { key: string } }) => ({ valid: ['user-api-key', 'scoped'].includes(body.key) && !revoked, key: ['user-api-key', 'scoped'].includes(body.key) && !revoked ? { referenceId: 'user-a', permissions: body.key === 'scoped' ? { sessions: ['session-a'] } : { global: ['sessions'] } } : null, error: null }) } } }))
const syncProgress = { phase: 'saving', messages: 125, contacts: 8, conversations: 4 }
const presenceRequests: Array<{ sessionId: string; conversationId: string }> = []
mock.module('../../server/src/services/whatsapp.ts', () => ({ whatsappService: {
  isSessionConnected: () => true,
  getChatSyncState: () => ({ syncStatus: 'syncing', syncProgress }),
  subscribeConversationPresence: async (sessionId: string, conversationId: string) => {
    presenceRequests.push({ sessionId, conversationId })
    if (conversationId === '123e4567-e89b-42d3-a456-426614174099') throw new Error('subscribe failed')
    return conversationId === '123e4567-e89b-42d3-a456-426614174000'
  },
} }))
mock.module('../../server/src/lib/chat-events.ts', () => ({ onChatChange: (fn: typeof listener) => { listener = fn; return () => { listener = async () => {} } } }))

const { authenticateRealtime, authorizeSession } = await import('../../server/src/middleware/auth.ts')
const { registerRealtimeHandlers } = await import('../../server/src/realtime/handlers.ts')
const { registerChatPublisher } = await import('../../server/src/realtime/publisher.ts')
const { realtimeOrigins, createRealtimeServer } = await import('../../server/src/realtime/server.ts')

assert.deepEqual(realtimeOrigins('https://example.com/'), [
  'https://example.com', 'http://localhost:3001', 'http://localhost:5173',
  'http://127.0.0.1:3001', 'http://127.0.0.1:5173',
])
for (const value of ['https://example.com/path', 'https://example.com?x=1', 'https://example.com.evil/path', 'invalid', '', 'https://example.com,http://localhost:5173']) assert.throws(() => realtimeOrigins(value))
const human = new Headers({ cookie: 'session=user' })
const admin = new Headers({ cookie: 'session=admin' })
const scoped = new Headers({ 'x-api-key': 'scoped' })
const apiKey = new Headers({ 'x-api-key': 'user-api-key' })
for (const headers of [new Headers(), new Headers({ authorization: 'Bearer invalid' })]) assert.equal(await authenticateRealtime(headers), false)
for (const headers of [human, admin, scoped, apiKey]) assert.equal(await authenticateRealtime(headers), true)
assert.equal(await authorizeSession(apiKey, session), true)
assert.equal(await authorizeSession(apiKey, { ...session, userId: 'other' }), false)
assert.equal(await authorizeSession(new Headers({ 'x-api-key': 'invalid', authorization: 'Bearer scoped' }), session), false)
assert.equal(await authorizeSession(human, session), true)
assert.equal(await authorizeSession(human, { ...session, userId: 'other' }), false)
assert.equal(await authorizeSession(scoped, { ...session, id: 'other' }), false)
assert.equal(await authorizeSession(admin, { ...session, userId: 'other' }), true)

const realtime = createRealtimeServer()
const originResults: number[] = []
for (const origin of ['http://localhost:5173', 'http://localhost:5173.evil', 'http://localhost:5173/']) {
  const response = await realtime.engine.handleRequest(new Request('http://localhost/api/ws/?EIO=4&transport=polling', { headers: { origin } }), { requestIP: () => ({ address: '127.0.0.1' }) } as never)
  originResults.push(response.status)
}
realtime.stopPublisher()
realtime.io.close()

let middleware: any, connect: any
const io: any = { use: (fn: any) => { middleware = fn }, on: (_: string, fn: any) => { connect = fn }, sockets: { sockets: new Map() } }
registerRealtimeHandlers(io, (candidate) => candidate.handshake.address)
function socket(headers: Record<string, string> = {}, auth: unknown = {}, query = {}) {
  const handlers: Record<string, any> = {}
  const events = new EventEmitter()
  const conn = new EventEmitter() as EventEmitter & { readyState: string }
  conn.readyState = 'open'
  const emitted: any[] = []
  const result: any = { handshake: { auth, query, headers, address: '127.0.0.1' }, conn, data: {}, connected: true, emitted,
    on: (name: string, fn: any) => { handlers[name] = fn; events.on(name, fn) },
    once: (name: string, fn: any) => { events.once(name, fn) },
    off: (name: string, fn: any) => { events.off(name, fn) },
    emit: (name: string, payload: any) => { emitted.push([name, payload]) },
    disconnect: () => { result.connected = false; events.emit('disconnect') }, handlers,
  }
  return result
}
async function handshake(s: any) { return await new Promise<any>((resolve) => middleware(s, (err: any) => resolve(err))) }
for (const headers of [{ cookie: 'session=user' }, { 'x-api-key': 'scoped' }]) {
  const candidate = socket(headers)
  assert.equal(await handshake(candidate), undefined)
  assert.equal(candidate.data.headers.get(headers.cookie ? 'cookie' : 'x-api-key'), headers.cookie ?? headers['x-api-key'])
  candidate.disconnect()
}
for (const candidate of [socket(), socket({ authorization: 'Bearer invalid' }), socket({}, {}, { token: 'scoped' })]) assert.equal((await handshake(candidate)).data.code, 'UNAUTHORIZED')
for (const candidate of [socket({ 'x-api-key': 'user-api-key' }), socket({}, { apiKey: 'user-api-key' })]) {
  assert.equal(await handshake(candidate), undefined)
  assert.equal(candidate.data.headers.get('x-api-key'), 'user-api-key')
  candidate.disconnect()
}
for (const candidate of [socket({}, {}, { apiKey: 'user-api-key' }), socket({ 'x-api-key': 'invalid', cookie: 'session=user' })]) assert.equal((await handshake(candidate)).data.code, 'UNAUTHORIZED')
const s = socket({ cookie: 'session=user' }); assert.equal(await handshake(s), undefined); connect(s)
async function subscribe(event: string, body: unknown) { return await new Promise<any>((resolve) => s.handlers[event](body, resolve)) }
const sub = 'chat.session.subscribe', unsub = 'chat.session.unsubscribe'
for (const body of [{}, { sessionId: '' }, { sessionId: 'session-a', extra: true }]) assert.equal((await subscribe(sub, body)).error.code, 'VALIDATION_ERROR')
assert.equal((await subscribe(sub, { sessionId: 'session-b' })).error.code, 'FORBIDDEN')
assert.equal((await subscribe(sub, { sessionId: 'missing' })).error.code, 'FORBIDDEN')
for (let i = 0; i < 2; i++) assert.deepEqual(await subscribe(sub, { sessionId: 'session-a' }), { ok: true, data: { sessionId: 'session-a', subscribed: true } })
assert.equal(s.data.sessions.size, 1)
assert.equal(s.emitted[0][0], 'chat.session.state')
assert.deepEqual(s.emitted[0][1].data.syncProgress, syncProgress)
assert.equal(s.emitted[0][1].version, 1)
for (let i = 0; i < 2; i++) assert.deepEqual(await subscribe(unsub, { sessionId: 'session-a' }), { ok: true, data: { sessionId: 'session-a', subscribed: false } })
assert.equal(s.data.sessions.size, 0)
await subscribe(sub, { sessionId: 'session-a' })
s.emitted.length = 0
io.sockets.sockets.set('a', s)
const stop = registerChatPublisher(io)
const now = new Date('2025-01-01T00:00:00.000Z')
const id = '123e4567-e89b-42d3-a456-426614174000', mid = '123e4567-e89b-42d3-a456-426614174001', mediaId = '123e4567-e89b-42d3-a456-426614174002'
assert.deepEqual(await subscribe('chat.presence.subscribe', { sessionId: session.id, conversationId: id }), { ok: true })
assert.deepEqual(presenceRequests, [{ sessionId: session.id, conversationId: id }])
for (const body of [
  {}, { sessionId: session.id, conversationId: 'invalid' },
  { sessionId: session.id, conversationId: id, jid: 'injected@s.whatsapp.net' },
  { sessionId: 'session-b', conversationId: id },
]) assert.deepEqual(await subscribe('chat.presence.subscribe', body), { ok: false })
assert.equal(presenceRequests.length, 1)
assert.deepEqual(await subscribe('chat.presence.subscribe', { sessionId: session.id, conversationId: mid }), { ok: false })
assert.deepEqual(await subscribe('chat.presence.subscribe', { sessionId: session.id, conversationId: '123e4567-e89b-42d3-a456-426614174099' }), { ok: false })
await subscribe(unsub, { sessionId: session.id })
const presenceCount = presenceRequests.length
assert.deepEqual(await subscribe('chat.presence.subscribe', { sessionId: session.id, conversationId: id }), { ok: false })
assert.equal(presenceRequests.length, presenceCount)
await subscribe(sub, { sessionId: session.id })
s.emitted.length = 0
message = { id: mid, sessionId: session.id, conversationId: id, messageId: 'wa-id', clientRequestId: null, fromMe: false, senderJid: null, senderName: null, type: 'image', text: null, hasLink: false, status: null, sentAt: null, orderAt: now, editedAt: null, deletedAt: null, createdAt: now, updatedAt: now, revision: 7, content: {}, raw: 'RAW_SECRET', media: { id: mediaId, sessionId: session.id, conversationId: id, messageId: mid, kind: 'image', mimeType: 'image/jpeg', fileName: null, size: null, duration: null, width: null, height: null, voice: false, thumbnailBase64: null, thumbnailMimeType: null, storageStatus: 'ready', createdAt: now, updatedAt: now, revision: 3, mediaKey: 'MEDIA_SECRET' } }
await listener({ sessionId: session.id, messageId: mid, mediaId, source: 'history' })
assert.deepEqual(s.emitted.map((entry: any) => entry[0]), ['chat.message.upserted', 'chat.media.updated'])
const envelope = s.emitted[0][1]
assert.equal(envelope.version, 1); assert.equal(envelope.sessionId, session.id); assert.match(envelope.eventId, /^[0-9a-f-]{36}$/); assert.ok(!Number.isNaN(Date.parse(envelope.occurredAt)))
assert.equal(envelope.data.source, 'history'); assert.equal(envelope.data.message.revision, 7); assert.equal(envelope.data.message.media.revision, 3)
assert.doesNotMatch(JSON.stringify(s.emitted), /RAW_SECRET|MEDIA_SECRET|mediaKey|"raw"/)
s.emitted.length = 0
await listener({ sessionId: session.id, messageId: mid })
assert.equal(s.emitted[0][1].data.source, 'update')
s.emitted.length = 0
message.isGroup = true
await listener({ sessionId: session.id, messageId: mid, mediaId })
assert.equal(s.emitted.length, 0)
message.isGroup = false
conversation = { id, labels: [], sessionId: session.id, jid: '5511999999999@s.whatsapp.net', contactId: null, contact: null, isGroup: false, lastMessageId: null, lastReadMessageId: null, lastActivityAt: null, unreadCount: 0, createdAt: now, updatedAt: now, revision: 1 }
message = null
contact = { id: mediaId, sessionId: session.id, jid: conversation.jid, phoneNumber: '5511999999999', name: null, pushName: null, avatarUrl: null, avatarCheckedAt: null, createdAt: now, updatedAt: now, revision: 1 }
await listener({ sessionId: session.id, conversationId: id, contactId: mediaId })
assert.deepEqual(s.emitted.map((entry: any) => entry[0]), ['chat.contact.upserted'])
s.emitted.length = 0
await listener({ sessionId: session.id, conversationId: id, messagesPruned: true })
assert.equal(s.emitted[0][0], 'chat.conversation.upserted')
assert.equal(s.emitted[0][1].data.conversation.lastMessage, null)
s.emitted.length = 0
message = { id: mid, sessionId: session.id, conversationId: id, messageId: 'wa-id', clientRequestId: null, fromMe: false, senderJid: null, senderName: null, type: 'unknown', text: null, hasLink: false, status: null, sentAt: null, orderAt: now, editedAt: null, deletedAt: null, createdAt: now, updatedAt: now, revision: 1, content: {}, media: null }
conversation.lastMessageId = mid
await listener({ sessionId: session.id, conversationId: id, messageId: mid })
assert.deepEqual(s.emitted.map((entry: any) => entry[0]), ['chat.message.upserted', 'chat.conversation.upserted'])
assert.equal(s.emitted[1][1].data.conversation.lastMessage.id, mid)
s.emitted.length = 0
conversation = { isGroup: true }
await listener({ sessionId: session.id, conversationId: id })
assert.equal(s.emitted.length, 0)
// Deleted conversations are published only to currently authorized subscribers.
const unsubscribed = socket({ cookie: 'session=user' }); await handshake(unsubscribed); connect(unsubscribed)
const denied = socket({ 'x-api-key': 'scoped' }); await handshake(denied); connect(denied)
denied.data.sessions.add('session-a')
denied.data.headers = new Headers({ authorization: 'Bearer invalid' })
const disconnected = socket({ cookie: 'session=user' }); await handshake(disconnected); connect(disconnected)
disconnected.data.sessions.add('session-a'); disconnected.connected = false
for (const [key, value] of [['unsubscribed', unsubscribed], ['denied', denied], ['disconnected', disconnected]] as const) io.sockets.sockets.set(key, value)
const deletedConversation = { conversationId: id, deletedAt: '2025-01-01T00:00:00.000Z' }
await listener({ sessionId: session.id, conversationId: id, deletedConversation })
assert.equal(s.emitted.length, 1)
assert.equal(s.emitted[0][0], 'chat.conversation.deleted')
const deletedEnvelope = s.emitted[0][1]
assert.equal(deletedEnvelope.version, 1)
assert.equal(deletedEnvelope.sessionId, session.id)
assert.match(deletedEnvelope.eventId, /^[0-9a-f-]{36}$/)
assert.ok(!Number.isNaN(Date.parse(deletedEnvelope.occurredAt)))
assert.deepEqual(deletedEnvelope.data, deletedConversation)
assert.equal(unsubscribed.emitted.length, 0)
assert.deepEqual(denied.emitted, [['chat.session.revoked', { sessionId: 'session-a' }]])
assert.equal(disconnected.emitted.length, 0)
assert.equal(denied.connected, true)
s.emitted.length = 0
// Typing shares the session authorization boundary and never loads/publishes messages.
await listener({ sessionId: session.id, typing: { conversationId: id } })
assert.equal(s.emitted.length, 1)
assert.equal(s.emitted[0][0], 'chat.typing')
assert.equal(s.emitted[0][1].version, 1)
assert.equal(s.emitted[0][1].sessionId, session.id)
assert.deepEqual(s.emitted[0][1].data, { conversationId: id })
assert.equal(unsubscribed.emitted.length, 0)
assert.equal(disconnected.emitted.length, 0)
assert.deepEqual(denied.emitted, [['chat.session.revoked', { sessionId: 'session-a' }]])
s.emitted.length = 0
await listener({ sessionId: 'session-b', typing: { conversationId: id } })
assert.equal(s.emitted.length, 0)
revoked = true
assert.equal(await authorizeSession(apiKey, session), false)
await listener({ sessionId: session.id, messageId: mid })
assert.deepEqual(s.emitted, [['chat.session.revoked', { sessionId: 'session-a' }]]); assert.equal(s.connected, true); assert.equal(s.data.sessions.size, 0)
stop()

assert.deepEqual(originResults, [200, 403, 403])
