import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const calls: { path: string; options: unknown }[] = []
let response: unknown
let failure: Error | null = null
mock.module('../../src/lib/api-client.ts', () => ({
  request: async (path: string, options: unknown) => {
    calls.push({ path, options })
    if (failure) throw failure
    return response
  },
}))
const { getChatLibrary, getChatMedia } = await import('../../src/services/chat.ts')
const session = '00000000-0000-4000-8000-000000000001'
const conversation = '00000000-0000-4000-8000-000000000002'
const messageId = '00000000-0000-4000-8000-000000000003'
const mediaId = '00000000-0000-4000-8000-000000000004'
const date = '2025-01-01T00:00:00.000Z'
const message = {
  id: messageId,
  sessionId: session,
  conversationId: conversation,
  messageId: 'wa-id',
  clientRequestId: null,
  fromMe: false,
  sender: { jid: null, name: null },
  type: 'text',
  text: 'https://example.com',
  status: null,
  hasLink: true,
  linkPreview: null,
  interactive: null,
  poll: null,
  album: null,
  groupInvite: null,
  system: null,
  unavailable: null,
  selection: null,
  sentAt: null,
  orderAt: date,
  createdAt: date,
  updatedAt: date,
  revision: 1,
  editedAt: null,
  deletedAt: null,
  media: null,
  replyTo: null,
  location: null,
  contacts: [],
  mentions: [],
  reactions: [],
}
const entry = {
  message,
  conversation: { id: conversation, sessionId: session, displayName: 'Contato', avatarUrl: null },
}
const page = {
  status: 'success',
  data: [entry],
  count: 3,
  page: { hasMore: true, nextCursor: 'next' },
}
const signal = new AbortController().signal
const params = {
  kind: 'link' as const,
  conversationId: conversation,
  cursor: 'opaque+/=',
  limit: 24,
}
response = page
assert.deepEqual(await getChatLibrary('session /?#', params, signal), page)
assert.deepEqual(calls.at(-1), {
  path: '/api/v1/session/session%20%2F%3F%23/library',
  options: { params, signal },
})
response = { status: 'success', data: [], count: 0, page: { hasMore: false, nextCursor: null } }
assert.deepEqual(await getChatLibrary(session), response)
assert.deepEqual(calls.at(-1), {
  path: `/api/v1/session/${session}/library`,
  options: { params: {}, signal: undefined },
})
for (const invalid of [
  { ...page, count: -1 },
  { ...page, count: 1.5 },
  { ...page, page: { hasMore: true, nextCursor: 9 } },
  { ...page, status: 'error' },
  { ...page, data: [{ ...entry, conversation: { ...entry.conversation, id: 'invalid' } }] },
  { ...page, data: [{ ...entry, message: { ...message, hasLink: null } }] },
  {
    ...page,
    data: [
      {
        ...entry,
        message: Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'hasLink')),
      },
    ],
  },
]) {
  response = invalid
  await assert.rejects(getChatLibrary(session), /./)
}
const error = new Error('request failed')
failure = error
await assert.rejects(getChatLibrary(session), (actual: unknown) => actual === error)
failure = null
const media = {
  id: mediaId,
  sessionId: session,
  conversationId: conversation,
  messageRecordId: messageId,
  kind: 'image',
  mimeType: 'image/jpeg',
  fileName: null,
  size: null,
  duration: null,
  width: null,
  height: null,
  voice: false,
  thumbnail: null,
  storageStatus: 'not_saved',
  contentPath: '/media',
  createdAt: date,
  updatedAt: date,
  revision: 1,
}
const mediaMessage = { ...message, type: 'image', media }
const mediaPage = {
  status: 'success',
  data: [{ ...media, message: mediaMessage }],
  count: 1,
  page: { hasMore: false, nextCursor: null },
}
response = mediaPage
const mediaParams = { kind: 'gallery' as const, cursor: 'cursor', limit: 24 }
assert.deepEqual(await getChatMedia('session /', 'conversation /', mediaParams, signal), mediaPage)
assert.deepEqual(calls.at(-1), {
  path: '/api/v1/session/session%20%2F/conversations/conversation%20%2F/media',
  options: { params: mediaParams, signal },
})
response = { ...mediaPage, data: [{ ...media, message: { ...mediaMessage, hasLink: undefined } }] }
await assert.rejects(getChatMedia(session, conversation), /./)
