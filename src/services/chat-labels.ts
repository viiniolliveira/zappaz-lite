import { z } from 'zod'
import { request } from '@/lib/api-client'
import { type LabelInput, labelSchema } from '@/lib/chat/labels'
import { conversationSchema, successSchema } from '@/lib/chat/schemas'

const base = (sessionId: string) =>
  `/api/v1/session/${encodeURIComponent(sessionId)}/conversation-labels`
export async function getChatLabels(sessionId: string, signal?: AbortSignal) {
  return successSchema(z.array(labelSchema)).parse(
    await request<unknown>(base(sessionId), { signal }),
  ).data
}
export async function saveChatLabel(sessionId: string, input: LabelInput, labelId?: string) {
  return successSchema(labelSchema).parse(
    await request<unknown>(
      labelId ? `${base(sessionId)}/${encodeURIComponent(labelId)}` : base(sessionId),
      { method: labelId ? 'PATCH' : 'POST', body: input },
    ),
  ).data
}
export async function deleteChatLabel(sessionId: string, labelId: string) {
  return successSchema(z.object({ labelId: z.uuid() })).parse(
    await request<unknown>(`${base(sessionId)}/${encodeURIComponent(labelId)}`, {
      method: 'DELETE',
    }),
  ).data
}
export async function setChatConversationLabels(
  sessionId: string,
  conversationId: string,
  labelIds: string[],
) {
  return successSchema(conversationSchema).parse(
    await request<unknown>(
      `/api/v1/session/${encodeURIComponent(sessionId)}/conversations/${encodeURIComponent(conversationId)}/labels`,
      { method: 'PUT', body: { labelIds } },
    ),
  ).data
}
