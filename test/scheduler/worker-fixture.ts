import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

let calls = 0
let release!: () => void
const gate = new Promise<void>((resolve) => {
  release = resolve
})
mock.module('@db/prisma', () => ({
  prisma: {
    waConversationDeletion: {
      findMany: async () => {
        calls++
        await gate
        return []
      },
    },
  },
}))
let callback!: () => Promise<void>
let unref = 0
let stopped = 0
Bun.cron = ((expression: string, run: () => Promise<void>) => {
  assert.equal(expression, '* * * * *')
  callback = run
  return {
    unref() {
      unref++
      return this
    },
    stop() {
      stopped++
    },
  }
}) as typeof Bun.cron
const { startConversationMediaCleanup } = await import(
  '../../server/src/lib/conversation-media-cleanup.ts'
)
const stop = startConversationMediaCleanup()
assert.equal(calls, 1)
assert.equal(unref, 1)
await callback()
assert.equal(calls, 1)
release()
await gate
await new Promise((resolve) => setTimeout(resolve, 0))
await callback()
assert.equal(calls, 2)
stop()
assert.equal(stopped, 1)
