import { afterEach, describe, expect, test } from 'bun:test'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { ZodError } from 'zod'
import { api } from '../../src/lib/api-client.ts'
import { conversationSchema, type MediaDTO } from '../../src/lib/chat/schemas.ts'
import {
  deleteChatConversation,
  deleteChatMessage,
  editChatMessage,
  findSavedChatContact,
  getChatConversation,
  getChatConversations,
  getChatMedia,
  getChatMediaContent,
  getChatMessage,
  getChatMessages,
  markChatRead,
  openChatConversation,
  sendChatMedia,
  sendChatText,
  setChatConversationReadState,
} from '../../src/services/chat.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

const originalAdapter = api.defaults.adapter
const conversation = mockConversations[0]
const message = mockMessage(1, conversation.id)
const page = {
  status: 'success',
  data: [],
  page: { nextCursor: null, hasMore: false },
  boundaries: { first: null, last: null },
}
let requests: InternalAxiosRequestConfig[] = []
function respond(data: unknown) {
  requests = []
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  api.defaults.adapter = adapter
}
afterEach(() => {
  api.defaults.adapter = originalAdapter
})

describe('frontend chat REST client', () => {
  test('edits the original message using scoped encoded IDs and validates text before sending', async () => {
    const edited = { ...message, text: 'Texto editado', editedAt: new Date().toISOString(), revision: 2 }
    respond({ status: 'success', data: edited })
    expect(await editChatMessage('session /?', 'conversation /?', 'message /?', { text: edited.text })).toEqual(edited)
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('patch')
    expect(requests[0].url).toBe('/api/v1/session/session%20%2F%3F/conversations/conversation%20%2F%3F/messages/message%20%2F%3F')
    expect(JSON.parse(requests[0].data)).toEqual({ text: edited.text })
    for (const text of ['', ' \n ', 'x'.repeat(65537)]) {
      await expect(editChatMessage('s', 'c', 'm', { text })).rejects.toBeInstanceOf(ZodError)
    }
    expect(requests).toHaveLength(1)
  })
  test('sets only the scoped Zappaz read state and validates the returned conversation', async () => {
    respond({ status: 'success', data: conversation })
    for (const read of [false, true]) {
      expect(await setChatConversationReadState('session /?', 'conversation /?', read)).toEqual(
        conversationSchema.parse(conversation),
      )
      const request = requests.at(-1)
      if (!request) throw new Error('Missing read-state request')
      expect(request.url).toBe(
        '/api/v1/session/session%20%2F%3F/conversations/conversation%20%2F%3F/read-state',
      )
      expect(request.method).toBe('patch')
      expect(JSON.parse(request.data)).toEqual({ read })
      expect(request.withCredentials).toBe(true)
    }
    expect(requests).toHaveLength(2)
    respond({ status: 'success', data: { ...conversation, unreadCount: -1 } })
    await expect(
      setChatConversationReadState(mockSessionId, conversation.id, false),
    ).rejects.toBeInstanceOf(ZodError)
  })
  test('validates gallery media, message and total count and forwards pagination', async () => {
    const mediaMessage = conversation.messages.find((item) => item.media)!
    const item = { ...mediaMessage.media!, message: mediaMessage }
    const response = {
      status: 'success',
      data: [item],
      count: 31,
      page: { hasMore: true, nextCursor: 'next' },
    }
    respond(response)
    const signal = new AbortController().signal
    expect(
      await getChatMedia(
        'session /?',
        'conversation /?',
        { kind: 'gallery', limit: 24, cursor: 'cursor' },
        signal,
      ),
    ).toEqual(response)
    expect(requests[0].url).toBe(
      '/api/v1/session/session%20%2F%3F/conversations/conversation%20%2F%3F/media',
    )
    expect(requests[0].params).toEqual({ kind: 'gallery', limit: 24, cursor: 'cursor' })
    expect(requests[0].signal).toBe(signal)
    for (const invalid of [
      { ...response, count: undefined },
      { ...response, count: -1 },
      { ...response, data: [{ ...item, message: undefined }] },
      { ...response, data: [{ ...item, message: { ...mediaMessage, id: null } }] },
    ]) {
      respond(invalid)
      await expect(getChatMedia(mockSessionId, conversation.id)).rejects.toBeInstanceOf(ZodError)
    }
  })
  test('deletes only the scoped message and validates the returned tombstone', async () => {
    const deleted = { ...message, deletedAt: message.createdAt, text: null, revision: 2 }
    respond({ status: 'success', data: deleted })
    expect(await deleteChatMessage('session /?', 'conversation /?', 'record /?')).toEqual(deleted)
    expect(requests[0].url).toBe(
      '/api/v1/session/session%20%2F%3F/conversations/conversation%20%2F%3F/messages/record%20%2F%3F',
    )
    expect(requests[0].method).toBe('delete')
  })
  test('passes pagination, abort signal and credentials to scoped list requests', async () => {
    respond(page)
    const signal = new AbortController().signal
    expect(
      await getChatConversations('session /?', { q: 'ana', cursor: 'next', limit: 5 }, signal),
    ).toEqual({ status: 'success', data: [], page: page.page })
    expect(requests[0].url).toBe('/api/v1/session/session%20%2F%3F/conversations')
    expect(requests[0].params).toEqual({ q: 'ana', cursor: 'next', limit: 5 })
    expect(requests[0].signal).toBe(signal)
    expect(requests[0].withCredentials).toBe(true)
  })

  test('uses internal conversation, contact and message record IDs in paths and bodies', async () => {
    respond({ status: 'success', data: conversation })
    expect(await getChatConversation(mockSessionId, conversation.id)).toEqual(
      conversationSchema.parse(conversation),
    )
    await openChatConversation(mockSessionId, { contactId: 'contact-internal' })
    await markChatRead(mockSessionId, conversation.id, 'record-internal')
    expect(requests[0].url).toBe(
      `/api/v1/session/${mockSessionId}/conversations/${conversation.id}`,
    )
    expect(JSON.parse(requests[1].data)).toEqual({ contactId: 'contact-internal' })
    expect(JSON.parse(requests[2].data)).toEqual({ lastReadMessageRecordId: 'record-internal' })
    respond({ status: 'success', data: message })
    await getChatMessage(mockSessionId, conversation.id, 'record /?')
    expect(requests[0].url).toEndWith('/messages/record%20%2F%3F')
    await sendChatText(mockSessionId, conversation.id, {
      text: 'Olá',
      clientRequestId: message.id,
      replyToMessageRecordId: message.id,
    })
    expect(JSON.parse(requests[1].data)).toEqual({
      text: 'Olá',
      clientRequestId: message.id,
      replyToMessageRecordId: message.id,
    })
  })

  test('opens a conversation by phone without creating an agenda contact', async () => {
    respond({ status: 'success', data: conversation })
    await openChatConversation(mockSessionId, { phoneNumber: '5511999999999' })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`/api/v1/session/${mockSessionId}/conversations`)
    expect(requests[0].method).toBe('post')
    expect(JSON.parse(requests[0].data)).toEqual({ phoneNumber: '5511999999999' })
  })

  test('searches all contact pages for an exact saved phone within the requested session', async () => {
    const contact = { ...conversation.contact!, phoneNumber: '5511999999999', isSaved: true }
    requests = []
    api.defaults.adapter = async (config) => {
      requests.push(config)
      const data =
        requests.length === 1
          ? {
              status: 'success',
              data: [
                { ...contact, isSaved: false },
                {
                  ...contact,
                  id: '00000000-0000-4000-8000-000000000099',
                  phoneNumber: '55119999999990',
                },
              ],
              page: { hasMore: true, nextCursor: 'next' },
            }
          : { status: 'success', data: [contact], page: { hasMore: false, nextCursor: null } }
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const signal = new AbortController().signal
    expect(await findSavedChatContact(mockSessionId, contact.phoneNumber, signal)).toEqual(contact)
    expect(requests.map((request) => request.params)).toEqual([
      { q: contact.phoneNumber, cursor: undefined },
      { q: contact.phoneNumber, cursor: 'next' },
    ])
    expect(
      requests.every(
        (request) =>
          request.url === `/api/v1/session/${mockSessionId}/contacts` && request.signal === signal,
      ),
    ).toBe(true)
  })

  test('returns null when no exact saved phone exists', async () => {
    respond({
      status: 'success',
      data: [{ ...conversation.contact!, phoneNumber: '5511999999999', isSaved: false }],
      page: { hasMore: false, nextCursor: null },
    })
    expect(await findSavedChatContact(mockSessionId, '5511999999999')).toBeNull()
  })

  test('deletes a scoped conversation and validates cleanup status', async () => {
    for (const mediaCleanup of ['complete', 'pending'] as const) {
      respond({ status: 'success', data: { conversationId: conversation.id, mediaCleanup } })
      expect(await deleteChatConversation('session /?', 'conversation /?')).toEqual({
        conversationId: conversation.id,
        mediaCleanup,
      })
      expect(requests[0].url).toBe(
        '/api/v1/session/session%20%2F%3F/conversations/conversation%20%2F%3F',
      )
      expect(requests[0].method).toBe('delete')
      expect(requests[0].withCredentials).toBe(true)
    }
    respond({
      status: 'success',
      data: { conversationId: conversation.id, mediaCleanup: 'unknown' },
    })
    await expect(deleteChatConversation(mockSessionId, conversation.id)).rejects.toBeInstanceOf(
      ZodError,
    )
  })

  test('rejects simultaneous before and after without issuing a request', async () => {
    respond(page)
    await expect(
      getChatMessages(mockSessionId, conversation.id, { before: 'a', after: 'b' }),
    ).rejects.toThrow('Use somente before ou after')
    expect(requests).toHaveLength(0)
    await getChatMessages(mockSessionId, conversation.id, { after: 'b', limit: 2 })
    expect(requests[0].params).toEqual({ after: 'b', limit: 2 })
  })

  test('validates responses and outgoing text before sending', async () => {
    respond({ status: 'success', data: { ...message, id: 'whatsapp-id' } })
    await expect(getChatMessage(mockSessionId, conversation.id, message.id)).rejects.toBeInstanceOf(
      ZodError,
    )
    await expect(
      sendChatText(mockSessionId, conversation.id, { text: '  ', clientRequestId: message.id }),
    ).rejects.toBeInstanceOf(ZodError)
    expect(requests).toHaveLength(1)
  })

  test('sends FormData without manually setting a content type', async () => {
    respond({ status: 'success', data: message })
    const form = new FormData()
    form.append('file', new Blob(['data'], { type: 'text/plain' }), 'file.txt')
    let contentType: unknown
    const interceptor = api.interceptors.request.use((config) => {
      contentType = config.headers.get('Content-Type')
      return config
    })
    try {
      await sendChatMedia(mockSessionId, conversation.id, form)
      expect(requests[0].url).toEndWith('/messages/media')
      expect(requests[0].data).toBe(form)
      expect(contentType).toBeUndefined()
    } finally {
      api.interceptors.request.eject(interceptor)
    }
  })

  test('only downloads media from its exact session and conversation path, as a Blob', async () => {
    const blob = new Blob(['media'])
    respond(blob)
    const media = {
      id: 'media /?',
      sessionId: mockSessionId,
      conversationId: conversation.id,
      contentPath: `/api/v1/session/${mockSessionId}/conversations/${conversation.id}/media/media%20%2F%3F/content`,
    } as MediaDTO
    const signal = new AbortController().signal
    expect(await getChatMediaContent(media, signal)).toBe(blob)
    expect(requests[0].url).toBe(media.contentPath)
    expect(requests[0].responseType).toBe('blob')
    expect(requests[0].signal).toBe(signal)
    for (const contentPath of [
      media.contentPath.replace(conversation.id, 'other'),
      `https://evil.test${media.contentPath}`,
      `${media.contentPath}?x=1`,
    ]) {
      await expect(getChatMediaContent({ ...media, contentPath }, signal)).rejects.toThrow(
        'fora do escopo',
      )
    }
    expect(requests).toHaveLength(1)
  })
})
