import { afterEach, expect, test } from 'bun:test'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'
import { QueryClient } from '@tanstack/react-query'
import { api } from '../../src/lib/api-client.ts'
import { sendApiChatTextAtom } from '../../src/atoms/chat-send.ts'
import { chatRepliesAtom, chatSessionIdAtom } from '../../src/atoms/ui.ts'
import { chatConnectionStatusAtom, chatSessionStateAtom } from '../../src/atoms/chat-cache.ts'
import { mockMessage, mockSessionId, mockConversations } from './mock-data.ts'

const adapter = api.defaults.adapter
afterEach(() => { api.defaults.adapter = adapter })

test('sends scoped replies with text and media, clearing only the sent reply', async () => {
  const conversationId = mockConversations[0].id
  for (const file of [undefined, new File(['test'], 'note.txt', { type: 'text/plain' })]) {
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
    store.set(queryClientAtom, client)
    store.set(chatSessionIdAtom, mockSessionId)
    store.set(chatConnectionStatusAtom, 'open')
    store.set(chatSessionStateAtom, { connected: true, enabled: true, syncStatus: 'idle' })
    const reply = mockMessage(1, conversationId)
    const key = `${mockSessionId}/${conversationId}`
    store.set(chatRepliesAtom, { [key]: reply, other: reply })
    api.defaults.adapter = async config => {
      if (file) expect(config.data.get('replyToMessageRecordId')).toBe(reply.id)
      else expect(JSON.parse(config.data).replyToMessageRecordId).toBe(reply.id)
      return { config, data: { status: 'success', data: mockMessage(2, conversationId) }, status: 200, statusText: 'OK', headers: {} }
    }
    expect(await store.set(sendApiChatTextAtom, { conversationId, text: 'Resposta', file })).toBe(true)
    expect(store.get(chatRepliesAtom)[key]).toBeUndefined()
    expect(store.get(chatRepliesAtom).other).toEqual(reply)
    client.clear()
  }
})

test('keeps the reply when sending is unavailable', async () => {
  const store = createStore()
  const reply = mockMessage(1, mockConversations[0].id)
  const key = `${mockSessionId}/${reply.conversationId}`
  store.set(chatSessionIdAtom, mockSessionId)
  store.set(chatRepliesAtom, { [key]: reply })
  expect(await store.set(sendApiChatTextAtom, { conversationId: reply.conversationId, text: 'Resposta' })).toBe(false)
  expect(store.get(chatRepliesAtom)[key]).toEqual(reply)
})
