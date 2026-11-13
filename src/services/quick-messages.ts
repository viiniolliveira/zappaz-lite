import { z } from 'zod'
import { request } from '@/lib/api-client'
import { type QuickMessageInput, quickMessageSchema } from '@/lib/chat/quick-messages'
import { successSchema } from '@/lib/chat/schemas'

const base = (sessionId: string) =>
  `/api/v1/session/${encodeURIComponent(sessionId)}/quick-messages`
export async function getQuickMessages(sessionId: string, signal?: AbortSignal) {
  return successSchema(z.array(quickMessageSchema)).parse(
    await request<unknown>(base(sessionId), { signal }),
  ).data
}
export async function saveQuickMessage(sessionId: string, input: QuickMessageInput, id?: string) {
  return successSchema(quickMessageSchema).parse(
    await request<unknown>(id ? `${base(sessionId)}/${encodeURIComponent(id)}` : base(sessionId), {
      method: id ? 'PATCH' : 'POST',
      body: input,
    }),
  ).data
}
export async function deleteQuickMessage(sessionId: string, id: string) {
  return successSchema(z.object({ quickMessageId: z.uuid() })).parse(
    await request<unknown>(`${base(sessionId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ).data
}
