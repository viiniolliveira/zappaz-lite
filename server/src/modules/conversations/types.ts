import type { z } from 'zod'
import type { ConversationQuerySchema } from './schema.ts'
export type ConversationQuery = z.infer<typeof ConversationQuerySchema>
