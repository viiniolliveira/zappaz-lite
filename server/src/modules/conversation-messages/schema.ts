import { z } from 'zod'
import { TextSignatureSchema } from '../../common/schema.ts'
export const MessageParamsSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().uuid(),
  messageRecordId: z.string().uuid().optional(),
  mediaId: z.string().uuid().optional(),
})
export const MessageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().max(4096).optional(),
    after: z.string().max(4096).optional(),
  })
  .refine((query) => !(query.before && query.after), 'before and after are mutually exclusive')
export const MediaQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(4096).optional(),
  kind: z.enum(['image', 'video', 'audio', 'document', 'sticker', 'gallery']).optional(),
})
export const SendTextSchema = z.strictObject({
  ...TextSignatureSchema.shape,
  text: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.trim().length > 0, 'Text cannot be blank'),
  replyToMessageRecordId: z.string().uuid().nullish(),
  clientRequestId: z.string().uuid(),
})
export const SendMediaSchema = z
  .strictObject({
    file: z.instanceof(File),
    kind: z.enum(['image', 'video', 'audio', 'document']),
    caption: z.string().max(4096).optional(),
    voice: z.enum(['true', 'false']).default('false'),
    replyToMessageRecordId: z.string().uuid().optional(),
    clientRequestId: z.string().uuid(),
  })
  .refine(
    (body) => body.kind === 'audio' || body.voice === 'false',
    'voice is only valid for audio',
  )
export { EditMessageSchema } from '../../../../shared/edit-message.ts'
