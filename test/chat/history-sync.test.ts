import { expect, test } from 'bun:test'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'
import { ChatHistorySync } from '../../server/src/lib/chat-history-sync.ts'

test('history synchronization is opt-in', () => {
  expect(CreateSessionConfigSchema.parse({}).syncFullHistory).toBe(false)
  expect(CreateSessionConfigSchema.parse({ syncFullHistory: true }).syncFullHistory).toBe(true)
})

test('serializes overlapping batches and waits for pending work before completion', async () => {
  const phases: unknown[] = []
  const sync = new ChatHistorySync(() => phases.push(sync.progress?.phase))
  const order: number[] = []
  const first = sync.enqueue(async () => {
    order.push(1)
    sync.advance('messages', 50)
  }, true)
  const second = sync.enqueue(async () => {
    expect(sync.progress?.phase).toBe('saving')
    order.push(2)
    sync.advance('messages', 2)
  }, false)
  await Promise.all([first, second])
  expect(order).toEqual([1, 2])
  expect(sync.progress?.messages).toBe(52)
  expect(sync.progress?.phase).toBe('complete')
  expect(sync.status).toBe('idle')
  expect(phases.at(-1)).toBe('complete')
})

test('does not declare completion just because a batch was saved', async () => {
  const sync = new ChatHistorySync(() => {})
  await sync.enqueue(async () => {
    sync.advance('contacts', 3)
  }, false)
  expect(sync.status).toBe('syncing')
  expect(sync.progress?.phase).toBe('waiting')
})

test('marks a partially rejected batch as failed without stopping queued work', async () => {
  const snapshots: Array<{ phase: string | undefined; status: string }> = []
  const sync = new ChatHistorySync(() =>
    snapshots.push({ phase: sync.progress?.phase, status: sync.status }),
  )
  const first = sync.enqueue(async () => {
    sync.advance('contacts', 2)
    sync.markFailed()
    expect(sync.status).toBe('error')
    expect(sync.progress?.phase).toBe('saving')
  }, true)
  const second = sync.enqueue(async () => {
    expect(sync.progress?.phase).toBe('saving')
    sync.advance('messages', 1)
  }, false)
  await Promise.all([first, second])
  expect(sync.status).toBe('error')
  expect(sync.progress).toEqual({ phase: 'error', contacts: 2, conversations: 0, messages: 1, errorId: expect.any(String) })
  expect(snapshots).toContainEqual({ phase: 'saving', status: 'error' })
})

test('acknowledges a failure in memory and reports a later failure again', () => {
  let publishes = 0
  const sync = new ChatHistorySync(() => publishes++)
  sync.markFailed()
  const first = sync.progress!.errorId!
  sync.acknowledgeError(first)
  expect(sync.status).toBe('idle')
  expect(sync.progress).toBeUndefined()
  sync.markFailed()
  const second = sync.progress!.errorId!
  expect(second).not.toBe(first)
  sync.acknowledgeError(first)
  expect(sync.status).toBe('error')
  sync.acknowledgeError(second)
  expect(sync.status).toBe('idle')
  expect(publishes).toBe(4)
})

test('acknowledgement preserves active sync and does not hide another failure', async () => {
  const sync = new ChatHistorySync(() => {})
  await sync.enqueue(async () => {
    sync.advance('messages', 3)
    sync.markFailed()
    sync.acknowledgeError(sync.progress!.errorId!)
    expect(sync.status).toBe('syncing')
    expect(sync.progress?.messages).toBe(3)
    expect(sync.progress?.phase).toBe('saving')
    sync.markFailed()
  }, true)
  expect(sync.status).toBe('error')
})

test('reports errors, preserves progress and processes later batches without hiding failures', async () => {
  const sync = new ChatHistorySync(() => {})
  await expect(
    sync.enqueue(async () => {
      sync.advance('messages')
      throw new Error('database unavailable')
    }, false),
  ).rejects.toThrow('database unavailable')
  await sync.enqueue(async () => {
    sync.advance('messages')
  }, true)
  expect(sync.status).toBe('error')
  expect(sync.progress?.phase).toBe('error')
  expect(sync.progress?.messages).toBe(2)
})

test('keeps saving phase while queued batches continue after a partial failure', async () => {
  const sync = new ChatHistorySync(() => {})
  const failed = sync.enqueue(async () => {
    sync.advance('messages')
    throw new Error('contact conflict')
  }, false)
  const later = sync.enqueue(async () => {
    expect(sync.progress?.phase).toBe('saving')
    expect(sync.status).toBe('error')
    sync.advance('messages', 50)
    expect(sync.progress?.phase).toBe('saving')
  }, true)
  await expect(failed).rejects.toThrow('contact conflict')
  await later
  expect(sync.progress?.phase).toBe('error')
  expect(sync.progress?.messages).toBe(51)
  await sync.enqueue(async () => {
    expect(sync.progress?.phase).toBe('saving')
  }, false)
  expect(sync.progress?.phase).toBe('error')
})
