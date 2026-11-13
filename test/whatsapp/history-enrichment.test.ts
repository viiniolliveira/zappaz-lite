import { expect, test } from 'bun:test'
import { ChatHistorySync } from '../../server/src/lib/chat-history-sync.ts'

test('enrichment runs once only after completion and all queued batches are persisted', async () => {
  const calls: string[] = []
  const sync = new ChatHistorySync(() => {}, async () => { calls.push('enrich') })
  const gate = Promise.withResolvers<void>()
  const first = sync.enqueue(async () => { await gate.promise; calls.push('first') }, true)
  const last = sync.enqueue(async () => { calls.push('last') }, false)
  expect(calls).toEqual([])
  gate.resolve()
  await Promise.all([first, last])
  expect(calls).toEqual(['first', 'last', 'enrich'])
  await sync.enqueue(async () => {}, true)
  expect(calls).toHaveLength(3)
})

test('incomplete or failed history does not start enrichment', async () => {
  let calls = 0
  const sync = new ChatHistorySync(() => {}, async () => { calls++ })
  await sync.enqueue(async () => {}, false)
  expect(calls).toBe(0)
  await expect(sync.enqueue(async () => { throw new Error('failed') }, true)).rejects.toThrow('failed')
  await sync.enqueue(async () => {}, true)
  expect(calls).toBe(0)
})
