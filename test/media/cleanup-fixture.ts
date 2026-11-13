import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { mediaStorageKey } from '../../server/src/lib/media-storage.ts'

const now = Date.now()
const old = new Date(now - 86400000 - 10000)
const recent = new Date(now)
const key = (message: string) => mediaStorageKey('session', 'conversation', message)
const special = mediaStorageKey('session/legacy', 'conversation', 'id.with.dot')
const objects = [
  [key('active'), old], [key('deleted'), old], [key('orphan'), old],
  [key('recent'), recent], [special, old], ['bad/path', old],
  ['session/conversation/!YWN0aXZl', old],
] as const
let enabled = true
let fail = true
const removed: string[] = []
const errors: unknown[] = []
const queries: Array<Record<string, string>> = []
const disk = {
  async listAll(_prefix: unknown, options: { paginationToken?: string }) {
    const entries = options.paginationToken ? objects.slice(4) : objects.slice(0, 4)
    return { objects: entries.map(([key, lastModified]) => ({ key, isFile: true, async getMetaData() { return { lastModified } } })), paginationToken: options.paginationToken ? undefined : 'next' }
  },
  async delete(key: string) {
    if (key.endsWith('/orphan') && fail) throw new Error('temporary failure')
    removed.push(key)
  },
}
mock.module('@db/prisma', () => ({ prisma: { waMessage: { async findFirst({ where }: { where: Record<string, string> }) {
  queries.push(where)
  if (where.messageId === 'active') return { deletedAt: null }
  if (where.messageId === 'deleted') return { deletedAt: new Date() }
  return null
} } } }))
mock.module('../../server/src/lib/logger.ts', () => ({ logger: { error: (value: unknown) => errors.push(value) } }))
mock.module('../../server/src/lib/media-storage.ts', () => ({ mediaStorageKey, getMediaStorage: () => enabled ? { disk } : null }))
const { reconcileMediaFiles } = await import('../../server/src/lib/media-cleanup.ts')
await reconcileMediaFiles()
assert.deepEqual(removed, [key('deleted'), special])
assert.equal(errors.length, 1)
assert.deepEqual(queries, [
  { sessionId: 'session', conversationId: 'conversation', messageId: 'active' },
  { sessionId: 'session', conversationId: 'conversation', messageId: 'deleted' },
  { sessionId: 'session', conversationId: 'conversation', messageId: 'orphan' },
  { sessionId: 'session/legacy', conversationId: 'conversation', messageId: 'id.with.dot' },
])
fail = false
await reconcileMediaFiles()
assert.ok(removed.includes(key('orphan')))
const count = queries.length
enabled = false
await reconcileMediaFiles()
assert.equal(queries.length, count)
