import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { BaileysEventMap, WAPresence } from 'baileys'

const queries: unknown[] = []
const changes: unknown[] = []
let found = true
mock.module('@db/prisma', () => ({ prisma: {
  globalWebhook: { findMany: async () => [] },
  waConversation: { findFirst: async (query: {
    where: { sessionId: string; id?: string; isGroup: boolean }
    select: { id?: boolean; jid?: boolean }
  }) => {
    queries.push(query)
    if (!found) return null
    if (query.select.jid)
      return query.where.sessionId === 'session' && query.where.id === 'conversation' && !query.where.isGroup
        ? { jid: '12345@lid' } : null
    return { id: 'conversation' }
  } },
} }))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  baileysLogger: {},
}))
mock.module('../../server/src/lib/chat-events.ts', () => ({ publishChatChange: (change: unknown) => changes.push(change) }))
const { publishReceivedTyping } = await import('../../server/src/lib/chat-presence.ts')
const presence = (jid: string, state: WAPresence = 'composing'): BaileysEventMap['presence.update'] => ({
  id: jid,
  presences: { [jid]: { lastKnownPresence: state } },
})

for (const jid of ['5511999999999@s.whatsapp.net', '12345@lid']) {
  await publishReceivedTyping('session', presence(jid), [])
  assert.deepEqual(changes.at(-1), { sessionId: 'session', typing: { conversationId: 'conversation' } })
  const query = queries.at(-1) as { where: { sessionId: string; isGroup: boolean; messages: unknown; OR: unknown[] } }
  assert.equal(query.where.sessionId, 'session')
  assert.equal(query.where.isGroup, false)
  assert.deepEqual(query.where.messages, { some: {} })
  assert.ok(JSON.stringify(query.where.OR).includes(jid.endsWith('@lid') ? 'lid' : 'phoneNumber'))
}
const before = queries.length
for (const state of ['paused', 'available', 'unavailable', 'recording'] as const)
  await publishReceivedTyping('session', presence('12345@lid', state), [])
for (const jid of ['12345@g.us', 'status@broadcast', '12345@newsletter'])
  await publishReceivedTyping('session', presence(jid), [])
await publishReceivedTyping('session', presence('12345@lid'), ['12345@lid'])
await publishReceivedTyping('session', presence('5511999999999@s.whatsapp.net'), ['5511999999999:2@s.whatsapp.net'])
await publishReceivedTyping('session', { id: '12345@lid', presences: { '99999@lid': { lastKnownPresence: 'composing' } } }, [])
assert.equal(queries.length, before)
assert.equal(changes.length, 2)
// Opening a conversation subscribes only its stored JID; it never sends our typing state.
const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const { CreateSessionConfigSchema } = await import('../../server/src/common/schema.ts')
const { whatsappService } = await import('../../server/src/services/whatsapp.ts')
const session = new WhatsappSession('session', false, CreateSessionConfigSchema.parse({}), 'Test', null)
const subscribedJids: string[] = []
let failSubscription = false
Reflect.set(session, 'client', {
  presenceSubscribe: async (jid: string) => {
    if (failSubscription) throw new Error('presence unavailable')
    subscribedJids.push(jid)
  },
  sendPresenceUpdate: () => { throw new Error('must not send typing') },
})
Reflect.set(session, '_status', 'open')
assert.equal(await session.subscribePresence('12345@lid'), false)
session.enabled = true
Reflect.set(session, '_status', 'close')
assert.equal(await session.subscribePresence('12345@lid'), false)
Reflect.set(session, '_status', 'open')
const sessions: unknown = Reflect.get(whatsappService, 'sessionMap')
assert.ok(sessions instanceof Map)
sessions.set('session', session)
found = true
assert.equal(await whatsappService.subscribeConversationPresence('session', 'conversation'), true)
assert.deepEqual(subscribedJids, ['12345@lid'])
assert.equal(await whatsappService.subscribeConversationPresence('foreign', 'conversation'), false)
assert.equal(await whatsappService.subscribeConversationPresence('session', 'missing-or-group'), false)
assert.deepEqual(subscribedJids, ['12345@lid'])
failSubscription = true
await assert.rejects(whatsappService.subscribeConversationPresence('session', 'conversation'), /presence unavailable/)
found = false
await publishReceivedTyping('session', presence('12345@lid'), [])
assert.equal(changes.length, 2)
// Exercise the Baileys event batch and its stale-client guard.
found = true
let processBatch: ((events: Partial<BaileysEventMap>) => Promise<void>) | undefined
const fakeClient = { ev: { process: (handler: typeof processBatch) => { processBatch = handler } } }
const forwarded: string[] = []
session.onEventForwarded = async (_sessionId, event) => { forwarded.push(event) }
Reflect.set(session, 'client', fakeClient)
Reflect.apply(Reflect.get(session, 'attachEventListeners'), session, [fakeClient])
assert.ok(processBatch)
const batch = { 'presence.update': presence('12345@lid') }
const beforeBatch = changes.length
await processBatch(batch)
assert.equal(changes.length, beforeBatch + 1)
assert.deepEqual(changes.at(-1), { sessionId: 'session', typing: { conversationId: 'conversation' } })
assert.deepEqual(forwarded, ['presence.update'])
Reflect.set(session, 'client', {})
await processBatch(batch)
assert.equal(changes.length, beforeBatch + 1)
assert.deepEqual(forwarded, ['presence.update'])
