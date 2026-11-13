import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const mode = process.argv[2]
const jobs: Array<{ expression: string; run: () => Promise<void> }> = []
const errors: string[] = []
const cutoffs: Date[] = []
const logCutoffs: Date[] = []
let reconciled = 0
let unblock!: () => void
let gate = new Promise<void>((resolve) => {
  unblock = resolve
})
let fail = false
mock.module('@db/prisma', () => ({
  prisma: {
    webhookLog: {
      deleteMany: async (args: { where: { createdAt: { lte: Date } } }) => {
        logCutoffs.push(args.where.createdAt.lte)
        if (fail) throw new Error('webhook failure')
        await gate
        return { count: 1 }
      },
    },
    waSession: {
      findMany: async () => {
        if (fail) throw new Error('session failure')
        await gate
        return []
      },
    },
  },
}))
mock.module('@lib/logger', () => ({
  logger: {
    info() {},
    error(value: { msg: string }) {
      errors.push(value.msg)
    },
  },
}))
mock.module('@server/services/whatsapp', () => ({
  default: { refreshProfilePictures: async () => {} },
}))
mock.module('../../server/src/lib/chat-retention.ts', () => ({
  pruneChatMessages: async (date: Date) => {
    cutoffs.push(date)
    if (fail) throw new Error('prune failure')
    await gate
    return { count: 1 }
  },
}))
mock.module('../../server/src/lib/media-cleanup.ts', () => ({
  reconcileMediaFiles: async () => {
    reconciled++
    await gate
  },
}))
Bun.cron = ((expression: string, run: () => Promise<void>) => {
  jobs.push({ expression, run })
  return { unref() {}, stop() {} }
}) as typeof Bun.cron
const now = 1_800_000_000_000
Date.now = () => now
const { runScheduledTasks } = await import('../../server/src/lib/utils.ts')
runScheduledTasks()
assert.deepEqual(
  jobs.map((job) => job.expression),
  Array(mode === 'off' || mode === 'webhook-off' ? 2 : 3).fill('@hourly'),
)
const promises = jobs.map(({ run }) => run())
for (const promise of promises) assert.ok(promise instanceof Promise)
let done = false
void Promise.all(promises).then(() => {
  done = true
})
await Promise.resolve()
assert.equal(done, false)
unblock()
await Promise.all(promises)
assert.equal(reconciled, 1)
assert.deepEqual(
  cutoffs.map(Number),
  mode === 'off' || mode === 'message-off' ? [] : [now - (mode === 'custom' ? 7 : 90) * 86400000],
)
assert.deepEqual(
  logCutoffs.map(Number),
  mode === 'off' || mode === 'webhook-off' ? [] : [now - (mode === 'custom' ? 3 : 1) * 86400000],
)
fail = true
gate = Promise.resolve()
await Promise.all(jobs.map(({ run }) => run()))
assert.ok(errors.includes('Error during profile picture update'))
if (mode !== 'off' && mode !== 'message-off')
  assert.ok(errors.includes('Unknown error during periodical message clean up'))
if (mode !== 'off' && mode !== 'webhook-off')
  assert.ok(errors.includes('Unknown error during periodical webhook log clean up'))
