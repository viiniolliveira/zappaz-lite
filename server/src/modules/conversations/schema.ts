import { z } from 'zod'
import { ContactQuerySchema, SaveContactSchema } from '../contacts/schema.ts'
export const ConversationQuerySchema = ContactQuerySchema.extend({ labelId: z.uuid().optional() })
export const ConversationParamsSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().uuid(),
})
export const CreateConversationSchema = z.union([
  z.strictObject({ contactId: z.uuid() }),
  SaveContactSchema.pick({ phoneNumber: true }),
])
export const ReadConversationSchema = z.strictObject({
  lastReadMessageRecordId: z.string().uuid(),
})
export const ConversationReadStateSchema = z.strictObject({
  read: z.boolean(),
})
