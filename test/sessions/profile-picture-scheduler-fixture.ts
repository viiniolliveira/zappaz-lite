import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

let query: unknown
const called: string[] = []
let complete!: () => void
const finished = new Promise<void>((resolve) => {
  complete = resolve
})
mock.module('@db/prisma', () => ({
  prisma: {
    waSession: {
      findMany: async (value: unknown) => {
        query = value
        return [
          { id: 'old', jid: '1@s.whatsapp.net', connectedAt: new Date(0) },
          { id: 'broken', jid: '2@s.whatsapp.net' },
          { id: 'next', jid: '3@s.whatsapp.net' },
          { id: 'no-jid', jid: null },
        ]
      },
    },
    webhookLog: { deleteMany: async () => ({ count: 0 }) },
  },
}))
mock.module('@server/services/whatsapp', () => ({
  default: {
    refreshProfilePictures: async (id: string) => {
      called.push(id)
      if (id === 'next') complete()
      if (id === 'broken') throw new Error('failure')
    },
  },
}))
mock.module('../../server/src/lib/chat-retention.ts', () => ({
  pruneChatMessages: async () => ({ count: 0 }),
}))
mock.module('../../server/src/lib/media-cleanup.ts', () => ({
  reconcileMediaFiles: async () => {},
}))
const ticks: Array<() => Promise<void>> = []
const original = Bun.cron
Bun.cron = ((expression: string, callback: () => Promise<void>) => {
  assert.equal(expression, '@hourly')
  ticks.push(callback)
  return { unref() {}, stop() {} }
}) as typeof Bun.cron
const { runScheduledTasks } = await import('../../server/src/lib/utils.ts')
runScheduledTasks()
Bun.cron = original
assert.equal(ticks.length, 3)
await ticks[2]()
await finished
assert.deepEqual(query, { where: { status: 'open', archived: false, enabled: true } })
assert.deepEqual(called, ['old', 'broken', 'next'])
