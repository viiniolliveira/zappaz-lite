import { strict as assert } from 'node:assert'
import { QueryClient } from '@tanstack/react-query'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'
import {
  chatAccessDeniedAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
} from '../../src/atoms/chat-cache.ts'
import {
  chatContactLibrarySummaryAtom,
  chatLibraryAtom,
} from '../../src/atoms/chat-contact-details.ts'
import { chatContactPanelAtom, chatSessionIdAtom, selectedChatIdAtom } from '../../src/atoms/ui.ts'
import { api } from '../../src/lib/api-client.ts'
import { chatKeys } from '../../src/lib/chat/merge.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
store.set(queryClientAtom, client)
const id = mockConversations[0].id
const other = mockConversations[1].id
const scoped = chatLibraryAtom({ sessionId: mockSessionId, conversationId: id, kind: 'media' })
const global = chatLibraryAtom({ sessionId: mockSessionId, conversationId: null, kind: 'link' })
const requests: { url: string; params: Record<string, unknown> }[] = []
api.defaults.adapter = ((config) => {
  const params = config.params as Record<string, unknown>
  requests.push({ url: config.url ?? '', params })
  const response: AxiosResponse = {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 'success',
      data: [],
      count: params.kind === 'all' ? 9 : 5,
      page: {
        hasMore: params.limit === 24 && !params.cursor,
        nextCursor: params.limit === 24 && !params.cursor ? 'cursor-2' : null,
      },
    },
  }
  return Promise.resolve(response)
}) satisfies AxiosAdapter
const unsubscribe = [
  store.sub(chatContactLibrarySummaryAtom, () => {}),
  store.sub(scoped, () => {}),
  store.sub(global, () => {}),
]
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw Error(`Timed out; requests=${JSON.stringify(requests)}`)
}
try {
  store.set(chatSessionIdAtom, mockSessionId)
  store.set(selectedChatIdAtom, id)
  store.set(chatContactPanelAtom, {
    sessionId: mockSessionId,
    conversationId: id,
    mediaMessageId: null,
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(requests.length, 0)
  store.set(chatSubscribedAtom, true)
  store.set(chatSubscribedSessionIdAtom, 'other')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(requests.length, 0)
  store.set(chatAccessDeniedAtom, true)
  store.set(chatSubscribedSessionIdAtom, mockSessionId)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(requests.length, 0)
  store.set(chatAccessDeniedAtom, false)
  await waitFor(
    () =>
      store.get(chatContactLibrarySummaryAtom).isSuccess &&
      store.get(scoped).isSuccess &&
      store.get(global).isSuccess,
  )
  assert.equal(store.get(chatContactLibrarySummaryAtom).data?.count, 9)
  for (const [kind, limit, conversationId] of [
    ['media', 4, id],
    ['all', 1, id],
    ['media', 24, id],
    ['link', 24, undefined],
  ] as const) {
    assert.ok(
      requests.some(
        (r) =>
          r.url === `/api/v1/session/${mockSessionId}/library` &&
          r.params.kind === kind &&
          r.params.limit === limit &&
          r.params.conversationId === conversationId,
      ),
      `missing ${kind}/${limit}`,
    )
  }
  await store.get(scoped).fetchNextPage()
  await waitFor(() => store.get(scoped).data?.pages.length === 2)
  assert.ok(requests.some((request) => request.params.cursor === 'cursor-2'))
  assert.equal(store.get(scoped).hasNextPage, false)
  const count = requests.length
  await client.invalidateQueries({ queryKey: chatKeys.contactMedia(mockSessionId, id) })
  assert.ok(requests.length >= count + 3, 'prefix invalidates summary and scoped library')
  store.set(selectedChatIdAtom, other)
  const before = requests.length
  await client.invalidateQueries({ queryKey: chatKeys.contactMedia(mockSessionId, id) })
  assert.equal(requests.length, before, 'mismatched selected conversation disables scoped queries')
  await client.invalidateQueries({ queryKey: [...chatKeys.session(mockSessionId), 'library'] })
  assert.ok(
    requests.length > before,
    'session library stays available independently of selected conversation',
  )
} finally {
  for (const stop of unsubscribe) stop()
  client.clear()
}
