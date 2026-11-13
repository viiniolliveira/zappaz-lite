import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import type { BaileysEventMap } from '@whiskeysockets/baileys'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'

type Events = Partial<BaileysEventMap>
type Callback = (events: Events) => Promise<void>
const calls: string[] = []
mock.module('@db/prisma', () => ({ prisma: {
  globalWebhook: { findMany: async () => [] },
  waSession: { update: async () => {} },
} }))
mock.module('../../server/src/lib/session-deletion.ts', () => ({
  deleteSessionData: async () => {},
  clearSessionMessages: async () => { calls.push('cleanup') },
}))
const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const makeSession = (status: string) => {
  const session = new WhatsappSession('test-session', false, CreateSessionConfigSchema.parse({}), 'Test', null)
  let callback: Callback | undefined
  const client = {
    ev: { process: (handler: Callback) => { callback = handler } },
    ws: { close: () => {} },
    logout: async () => { throw new Error('remote logout must not call socket logout') },
  }
  Object.defineProperty(session, 'client', { value: client, writable: true })
  Object.defineProperty(session, '_status', { value: status, writable: true })
  Reflect.get(session, 'attachEventListeners').call(session, client)
  assert.ok(callback)
  return { session, callback }
}
const close: Events = {
  'connection.update': {
    connection: 'close',
    lastDisconnect: { error: Object.assign(new Error('logged out'), { output: { statusCode: 401 } }), date: new Date() },
  },
}
const messages: Events = { 'messages.upsert': { messages: [], type: 'notify' } }
const withinTimeout = async (work: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('event callback deadlocked')), 2000) })])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const first = makeSession('open')
let release!: () => void
const deferred = new Promise<void>(resolve => { release = resolve })
Object.defineProperty(first.session, 'onMessagesUpsert', { value: async (event: Events['messages.upsert']) => {
  if (!event) return
  calls.push('data-start')
  await deferred
  calls.push('data-finished')
} })
const processing = first.callback({ ...close, ...messages })
assert.deepEqual(calls, ['data-start'])
release()
await withinTimeout(processing)
assert.deepEqual(calls, ['data-start', 'data-finished', 'cleanup'])

calls.length = 0
const concurrent = makeSession('open')
let releaseEarlier!: () => void
const earlierData = new Promise<void>(resolve => { releaseEarlier = resolve })
Object.defineProperty(concurrent.session, 'onMessagesUpsert', { value: async (event: Events['messages.upsert']) => {
  if (!event) return
  calls.push('earlier-start')
  await earlierData
  calls.push('earlier-finished')
} })
const dataProcessing = concurrent.callback(messages)
const closeProcessing = concurrent.callback(close)
await Promise.resolve()
assert.deepEqual(calls, ['earlier-start'])
releaseEarlier()
await withinTimeout(Promise.all([dataProcessing, closeProcessing]).then(() => {}))
assert.deepEqual(calls, ['earlier-start', 'earlier-finished', 'cleanup'])

calls.length = 0
const alreadyClosed = makeSession('close')
await withinTimeout(alreadyClosed.callback(close))
assert.deepEqual(calls, ['cleanup'], '401 must clear messages even when status is already close')

calls.length = 0
const stale = makeSession('open')
Object.defineProperty(stale.session, 'onMessagesUpsert', { value: async (event: Events['messages.upsert']) => { if (event) calls.push('stale-data') } })
Object.defineProperty(stale.session, 'client', { value: {}, writable: true })
await withinTimeout(stale.callback({ ...close, ...messages }))
assert.deepEqual(calls, [], 'events from a replaced client must be ignored')
