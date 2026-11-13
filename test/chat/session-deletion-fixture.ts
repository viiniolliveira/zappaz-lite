import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mock } from 'bun:test'

const scenario = process.argv[2]
const sessionId = '../target/session'
const root = await mkdtemp('/tmp/opencode/session-deletion-')
const encoded = `!${Buffer.from(sessionId).toString('base64url')}`
const other = `${encoded}-other`
const operations: string[] = []
let messages = 1
let conversations = 1
let receipts = 1
let session = 1
const scoped = (input: { where: { sessionId: string } }) => assert.equal(input.where.sessionId, sessionId)
const tx = {
  $executeRaw: async () => 0,
  waMessageMedia: { findMany: async (input: { where: { sessionId: string } }) => { scoped(input); return [{ storage: 'local' }] } },
  waConversationDeletion: {
    findMany: async (input: { where: { sessionId: string } }) => { scoped(input); return receipts ? [{ storages: ['local'] }] : [] },
    deleteMany: async (input: { where: { sessionId: string } }) => { scoped(input); receipts = 0; operations.push('receipts') },
  },
  waMessage: { deleteMany: async (input: { where: { sessionId: string } }) => { scoped(input); messages = 0; operations.push('messages') } },
  waConversation: { findMany: async (input: { where: { sessionId: string } }) => { scoped(input); return [{ id: 'conversation' }] }, updateMany: async (input: { where: { sessionId: string }; data: Record<string, unknown> }) => {
    scoped(input)
    assert.equal(input.data.unreadCount, 0)
    assert.deepEqual(input.data.revision, { increment: 1 })
    operations.push('reset-conversations')
  } },
  baileysAuthState: { deleteMany: async (input: { where: { sessionId: string } }) => { scoped(input); operations.push('auth') } },
  webhookLog: { deleteMany: async (input: { where: { sessionId: string } }) => { scoped(input); operations.push('logs') } },
  waSession: { delete: async (input: { where: { id: string } }) => { assert.equal(input.where.id, sessionId); session = 0; conversations = 0; messages = 0; operations.push('session') } },
}
mock.module('@db/prisma', () => ({ prisma: { ...tx, $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }))
mock.module('../../server/src/lib/chat-events.ts', () => ({ publishChatChange: () => {} }))
mock.module('../../server/src/lib/logger.ts', () => ({ logger: { error: () => {} } }))
process.env.MEDIA_STORAGE_PATH = root
process.env.MEDIA_STORAGE_DRIVER = 'fs'
process.env.MEDIA_STORAGE_ENABLED = scenario === 'disabled' ? 'false' : 'true'
const { deleteSessionData, clearSessionMessages } = await import('../../server/src/lib/session-deletion.ts')
try {
  await mkdir(join(root, encoded, 'empty'), { recursive: true })
  await mkdir(join(root, encoded, 'conversation'), { recursive: true })
  await mkdir(join(root, other), { recursive: true })
  await writeFile(join(root, encoded, 'conversation', 'message'), 'private')
  await writeFile(join(root, other, 'keep'), 'keep')
  const cleanup = scenario === 'delete' ? deleteSessionData : clearSessionMessages
  await cleanup(sessionId)
  await assert.rejects(() => readFile(join(root, encoded, 'conversation', 'message')), { code: 'ENOENT' })
  await assert.rejects(() => Bun.file(join(root, encoded)).stat(), { code: 'ENOENT' })
  assert.equal(await readFile(join(root, other, 'keep'), 'utf8'), 'keep')
  assert.equal(receipts, 0)
  assert.equal(messages, 0)
  if (scenario === 'delete') {
    assert.equal(session, 0)
    assert.equal(conversations, 0)
    assert.ok(operations.includes('auth'))
    assert.ok(operations.includes('logs'))
  } else {
    assert.equal(session, 1)
    assert.equal(conversations, 1)
    assert.ok(operations.includes('reset-conversations'))
    assert.ok(!operations.includes('auth'))
    assert.ok(!operations.includes('logs'))
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
