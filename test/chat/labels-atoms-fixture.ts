import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { QueryClient } from '@tanstack/react-query'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const notices: string[] = []
mock.module('sonner', () => ({
  toast: {
    success: (message: string) => notices.push(message),
    error: (message: string) => notices.push(message),
  },
}))
const ui = await import('../../src/atoms/ui.ts')
const cache = await import('../../src/atoms/chat-cache.ts')
const atoms = await import('../../src/atoms/chat-labels.ts')
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(ui.chatSessionIdAtom, mockSessionId)
const firstLabel = '00000000-0000-4000-8000-000000000801'
const secondLabel = '00000000-0000-4000-8000-000000000802'
const thirdLabel = '00000000-0000-4000-8000-000000000803'
const conversations = mockConversations
  .slice(0, 2)
  .map((conversation, index) => ({ ...conversation, labelIds: [index ? secondLabel : firstLabel] }))
const ids = conversations.map((conversation) => conversation.id)
store.set(cache.chatLiveCacheAtom, { contacts: [], messages: [], conversations })
let failId: string | null = null
let pause: (() => Promise<void>) | null = null
const writes: string[] = []
api.defaults.adapter = async (config) => {
  const id = config.url?.split('/conversations/')[1]?.split('/')[0]
  const conversation = conversations.find((item) => item.id === id)
  if (config.method === 'delete')
    return {
      config,
      data: { status: 'success', data: { labelId: firstLabel } },
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  assert.ok(conversation)
  if (pause) await pause()
  if (id === failId) throw new Error('Falha ao salvar')
  if (config.method === 'put') {
    writes.push(conversation.id)
    conversation.labelIds = JSON.parse(config.data).labelIds
    conversation.revision++
  }
  return {
    config,
    data: { status: 'success', data: { ...conversation } },
    status: 200,
    statusText: 'OK',
    headers: {},
  }
}

store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
store.set(ui.chatBulkLabelsOpenAtom, true)
// The selected conversations need not all be present in the loaded list cache.
store.set(cache.chatLiveCacheAtom, {
  contacts: [],
  messages: [],
  conversations: [conversations[0]],
})
const unsubscribe = store.sub(atoms.chatBulkLabelConversationsAtom, () => {})
const aggregate = await store.get(atoms.chatBulkLabelConversationsAtom).refetch()
assert.deepEqual(aggregate.data?.map((conversation) => conversation.id).sort(), [...ids].sort())
assert.deepEqual(
  aggregate.data?.map((conversation) => conversation.labelIds),
  [[firstLabel], [secondLabel]],
)
failId = ids[1]
const failedAggregate = await store.get(atoms.chatBulkLabelConversationsAtom).refetch()
assert.equal(failedAggregate.isError, true)
assert.equal(writes.length, 0)
failId = null
unsubscribe()

assert.equal(await store.set(atoms.applyChatBulkLabelsAtom, { changes: {} }), false)
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, { changes: { [thirdLabel]: true } }),
  true,
)
assert.deepEqual(
  conversations.map((item) => item.labelIds),
  [
    [firstLabel, thirdLabel],
    [secondLabel, thirdLabel],
  ],
)
assert.equal(store.get(ui.chatConversationSelectionAtom), null)
assert.equal(store.get(ui.chatBulkLabelsOpenAtom), false)
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, { changes: { [thirdLabel]: false } }),
  true,
)
assert.deepEqual(
  conversations.map((item) => item.labelIds),
  [[firstLabel], [secondLabel]],
)

// Apply additions and removals together, preserving untouched partial labels and
// labels received on the server after the dialog's initial snapshot.
const concurrentLabel = '00000000-0000-4000-8000-000000000804'
conversations[0].labelIds.push(concurrentLabel)
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, {
    changes: { [firstLabel]: false, [thirdLabel]: true },
  }),
  true,
)
assert.deepEqual(
  conversations.map((item) => item.labelIds),
  [
    [concurrentLabel, thirdLabel],
    [secondLabel, thirdLabel],
  ],
)
const previousWrites = writes.length
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, { changes: { [thirdLabel]: true } }),
  true,
)
assert.equal(writes.length, previousWrites)
conversations[0].labelIds = [firstLabel]
conversations[1].labelIds = [secondLabel]

failId = ids[1]
store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids })
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, { changes: { [thirdLabel]: true } }),
  false,
)
assert.deepEqual(store.get(ui.chatConversationSelectionAtom)?.ids, [ids[1]])
assert.deepEqual(conversations[1].labelIds, [secondLabel])
assert.ok(notices.some((message) => message.includes('não foram atualizadas')))
failId = null

assert.equal(
  await store.set(atoms.manageChatLabelAtom, {
    action: 'link',
    conversationId: ids[0],
    labelIds: [secondLabel],
  }),
  true,
)
assert.deepEqual(
  store.get(cache.chatLiveCacheAtom).conversations.find((item) => item.id === ids[0])?.labelIds,
  [secondLabel],
)
store.set(ui.chatLabelFilterAtom, firstLabel)
assert.equal(
  await store.set(atoms.manageChatLabelAtom, { action: 'delete', labelId: firstLabel }),
  true,
)
assert.equal(store.get(ui.chatLabelFilterAtom), null)

store.set(ui.chatConversationSelectionAtom, { sessionId: mockSessionId, ids: [ids[0]] })
let release: (() => void) | undefined
pause = () =>
  new Promise<void>((resolve) => {
    release = resolve
  })
const pending = store.set(atoms.applyChatBulkLabelsAtom, {
  changes: { [thirdLabel]: true },
})
for (let attempt = 0; !release && attempt < 100; attempt++) await Bun.sleep(1)
assert.ok(release)
pause = null
store.set(ui.chatSessionIdAtom, 'foreign')
store.set(ui.chatConversationSelectionAtom, { sessionId: 'foreign', ids: ['foreign'] })
store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [], messages: [] })
release()
assert.equal(await pending, true)
assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [])
assert.deepEqual(store.get(ui.chatConversationSelectionAtom), {
  sessionId: 'foreign',
  ids: ['foreign'],
})
store.set(ui.chatSessionIdAtom, null)
assert.equal(
  await store.set(atoms.applyChatBulkLabelsAtom, { changes: { [firstLabel]: true } }),
  false,
)
assert.equal(
  await store.set(atoms.manageChatLabelAtom, {
    action: 'link',
    conversationId: ids[0],
    labelIds: [],
  }),
  false,
)
client.clear()
