import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

const mode = process.argv[2]
let fail = true
let writes = 0
const tx = {
  $executeRaw: async () => 0,
  waMessageMedia: { findMany: async () => [{ storage: 'local' }] },
  waConversationDeletion: { findMany: async () => [{ storages: ['local'] }], deleteMany: async () => { writes++ } },
  waMessage: { deleteMany: async () => { writes++ } },
  waConversation: { findMany: async () => [], updateMany: async () => { writes++ } },
  baileysAuthState: { deleteMany: async () => { writes++ } },
  webhookLog: { deleteMany: async () => { writes++ } },
  waSession: { delete: async () => { writes++ } },
}
mock.module('@db/prisma', () => ({ prisma: { $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }))
mock.module('../../server/src/lib/chat-events.ts', () => ({ publishChatChange: () => {} }))
mock.module('../../server/src/lib/media-storage.ts', () => ({
  mediaStorageKey: () => 'target/conversation/message',
  createMediaStorage: () => ({ disk: { driver: { deleteAll: async (prefix: string) => {
    assert.equal(prefix, 'target/')
    if (fail) throw new Error('storage offline')
  } } } }),
}))
const { clearSessionMessages, deleteSessionData } = await import('../../server/src/lib/session-deletion.ts')
const cleanup = mode === 'delete' ? deleteSessionData : clearSessionMessages
await assert.rejects(cleanup('target'), (error: unknown) => {
  assert.ok(error instanceof Error)
  assert.equal(Reflect.get(error, 'status'), 503)
  assert.equal(Reflect.get(error, 'code'), 'STORAGE_UNAVAILABLE')
  return true
})
assert.equal(writes, 0, 'failed cleanup must preserve records and storage metadata')
fail = false
await cleanup('target')
assert.ok(writes > 0, 'retry should clean database records after storage recovers')
