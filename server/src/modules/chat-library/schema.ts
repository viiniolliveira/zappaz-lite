import { z } from 'zod'

export const LibraryParamsSchema = z.object({ sessionId: z.string().min(1) })
export const LibraryQuerySchema = z.object({
  kind: z.enum(['media', 'document', 'link', 'all']).default('media'),
  conversationId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(4096).optional(),
})
