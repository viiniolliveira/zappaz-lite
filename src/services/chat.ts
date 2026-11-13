import { z } from 'zod'
import { request } from '@/lib/api-client'
import {
  contactSchema,
  conversationSchema,
  type LibraryKind,
  libraryPageSchema,
  type MediaDTO,
  mediaPageSchema,
  messagePageSchema,
  messageSchema,
  pageSchema,
  successSchema,
} from '@/lib/chat/schemas'
import { EditMessageSchema } from '../../shared/edit-message'

const scope = (sessionId: string) => `/api/v1/session/${encodeURIComponent(sessionId)}`
const conversationPath = (sessionId: string, conversationId: string) =>
  `${scope(sessionId)}/conversations/${encodeURIComponent(conversationId)}`

export async function getChatConversations(
  sessionId: string,
  params: { q?: string; cursor?: string; limit?: number; labelId?: string } = {},
  signal?: AbortSignal,
) {
  return pageSchema(conversationSchema).parse(
    await request<unknown>(`${scope(sessionId)}/conversations`, { params, signal }),
  )
}
export async function getChatContacts(
  sessionId: string,
  params: { q?: string; cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
) {
  return pageSchema(contactSchema).parse(
    await request<unknown>(`${scope(sessionId)}/contacts`, { params, signal }),
  )
}
export async function refreshChatContactAvatar(sessionId: string, contactId: string) {
  return successSchema(contactSchema).parse(
    await request<unknown>(`${scope(sessionId)}/contacts/${encodeURIComponent(contactId)}/avatar`, {
      method: 'POST',
    }),
  ).data
}
export async function findSavedChatContact(
  sessionId: string,
  phoneNumber: string,
  signal?: AbortSignal,
) {
  let cursor: string | undefined
  do {
    const page = await getChatContacts(sessionId, { q: phoneNumber, cursor }, signal)
    const contact = page.data.find((item) => item.isSaved && item.phoneNumber === phoneNumber)
    if (contact) return contact
    cursor = page.page.hasMore ? (page.page.nextCursor ?? undefined) : undefined
  } while (cursor)
  return null
}
export const contactNameSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(200, 'Use até 200 caracteres'),
  email: z
    .string()
    .trim()
    .max(254, 'Use até 254 caracteres')
    .pipe(z.union([z.email('Informe um email válido'), z.literal('')]))
    .optional(),
  annotations: z.string().trim().max(5000, 'Use até 5.000 caracteres').optional(),
})
export const saveChatContactSchema = contactNameSchema.extend({
  phoneNumber: z
    .string()
    .max(40)
    .transform((value) => value.replace(/[+\s()-]/g, ''))
    .pipe(z.string().regex(/^[1-9]\d{6,14}$/, 'Informe o telefone com código do país e DDD')),
})
export async function saveChatContact(
  sessionId: string,
  input: z.infer<typeof saveChatContactSchema>,
) {
  return successSchema(contactSchema).parse(
    await request<unknown>(`${scope(sessionId)}/contacts`, {
      method: 'POST',
      body: saveChatContactSchema.parse(input),
    }),
  ).data
}
export async function updateChatContact(
  sessionId: string,
  contactId: string,
  input: z.infer<typeof contactNameSchema>,
  save = false,
) {
  return successSchema(contactSchema).parse(
    await request<unknown>(`${scope(sessionId)}/contacts/${encodeURIComponent(contactId)}`, {
      method: save ? 'PUT' : 'PATCH',
      body: contactNameSchema.parse(input),
    }),
  ).data
}
export async function deleteChatContact(sessionId: string, contactId: string) {
  return successSchema(contactSchema).parse(
    await request<unknown>(`${scope(sessionId)}/contacts/${encodeURIComponent(contactId)}`, {
      method: 'DELETE',
    }),
  ).data
}
export async function getChatConversation(
  sessionId: string,
  conversationId: string,
  signal?: AbortSignal,
) {
  return successSchema(conversationSchema).parse(
    await request<unknown>(conversationPath(sessionId, conversationId), { signal }),
  ).data
}
export async function openChatConversation(
  sessionId: string,
  input: { contactId: string } | { phoneNumber: string },
) {
  return successSchema(conversationSchema).parse(
    await request<unknown>(`${scope(sessionId)}/conversations`, { method: 'POST', body: input }),
  ).data
}
const deletionResultSchema = successSchema(
  z.object({ conversationId: z.uuid(), mediaCleanup: z.enum(['complete', 'pending']) }),
)
export async function deleteChatConversation(sessionId: string, conversationId: string) {
  return deletionResultSchema.parse(
    await request<unknown>(conversationPath(sessionId, conversationId), { method: 'DELETE' }),
  ).data
}
export async function getChatMessages(
  sessionId: string,
  conversationId: string,
  params: { before?: string; after?: string; limit?: number } = {},
  signal?: AbortSignal,
) {
  if (params.before && params.after) throw new Error('Use somente before ou after')
  return messagePageSchema.parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/messages`, {
      params,
      signal,
    }),
  )
}
export async function getChatMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
  signal?: AbortSignal,
) {
  return successSchema(messageSchema).parse(
    await request<unknown>(
      `${conversationPath(sessionId, conversationId)}/messages/${encodeURIComponent(messageRecordId)}`,
      { signal },
    ),
  ).data
}
export async function deleteChatMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
) {
  return successSchema(messageSchema).parse(
    await request<unknown>(
      `${conversationPath(sessionId, conversationId)}/messages/${encodeURIComponent(messageRecordId)}`,
      { method: 'DELETE' },
    ),
  ).data
}
export { EditMessageSchema as editChatMessageSchema }
export async function editChatMessage(
  sessionId: string,
  conversationId: string,
  messageRecordId: string,
  input: z.infer<typeof EditMessageSchema>,
) {
  return successSchema(messageSchema).parse(
    await request<unknown>(
      `${conversationPath(sessionId, conversationId)}/messages/${encodeURIComponent(messageRecordId)}`,
      { method: 'PATCH', body: EditMessageSchema.parse(input) },
    ),
  ).data
}

export const sendChatTextSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.trim().length > 0),
  clientRequestId: z.uuid(),
  replyToMessageRecordId: z.uuid().nullable().optional(),
})
export async function sendChatText(
  sessionId: string,
  conversationId: string,
  body: z.infer<typeof sendChatTextSchema>,
) {
  return successSchema(messageSchema).parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/messages/text`, {
      method: 'POST',
      body: sendChatTextSchema.parse(body),
    }),
  ).data
}
export async function sendChatMedia(sessionId: string, conversationId: string, body: FormData) {
  return successSchema(messageSchema).parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/messages/media`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': undefined },
    }),
  ).data
}
export async function markChatRead(
  sessionId: string,
  conversationId: string,
  lastReadMessageRecordId: string,
) {
  return successSchema(conversationSchema).parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/read`, {
      method: 'POST',
      body: { lastReadMessageRecordId },
    }),
  ).data
}
export async function setChatConversationReadState(
  sessionId: string,
  conversationId: string,
  read: boolean,
) {
  return successSchema(conversationSchema).parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/read-state`, {
      method: 'PATCH',
      body: { read },
    }),
  ).data
}
export async function getChatMedia(
  sessionId: string,
  conversationId: string,
  params: { cursor?: string; kind?: MediaDTO['kind'] | 'gallery'; limit?: number } = {},
  signal?: AbortSignal,
) {
  return mediaPageSchema.parse(
    await request<unknown>(`${conversationPath(sessionId, conversationId)}/media`, {
      params,
      signal,
    }),
  )
}
export async function getChatLibrary(
  sessionId: string,
  params: {
    kind?: LibraryKind | 'all'
    conversationId?: string
    cursor?: string
    limit?: number
  } = {},
  signal?: AbortSignal,
) {
  return libraryPageSchema.parse(
    await request<unknown>(`${scope(sessionId)}/library`, { params, signal }),
  )
}
export type MediaContentRequest = Pick<
  MediaDTO,
  'sessionId' | 'conversationId' | 'id' | 'contentPath'
>
export async function getChatMediaContent(
  media: MediaContentRequest,
  signal: AbortSignal,
): Promise<Blob> {
  const expectedPath = `${conversationPath(media.sessionId, media.conversationId)}/media/${encodeURIComponent(media.id)}/content`
  if (media.contentPath !== expectedPath)
    throw new Error('Caminho de mídia fora do escopo da conversa')
  return request<Blob>(expectedPath, { signal, responseType: 'blob' })
}
