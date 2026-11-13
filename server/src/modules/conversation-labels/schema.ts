import { z } from 'zod'

export const LabelParamsSchema = z.object({
  sessionId: z.string().min(1),
  labelId: z.uuid(),
})
export const SaveLabelSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((value) => value.toLowerCase()),
})
export const ConversationLabelsSchema = z.strictObject({
  labelIds: z
    .array(z.uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Etiquetas repetidas'),
})
