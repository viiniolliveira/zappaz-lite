import { z } from 'zod'

export const QuickMessageSessionSchema = z.object({ sessionId: z.string().min(1) })
export const QuickMessageParamsSchema = QuickMessageSessionSchema.extend({
  quickMessageId: z.uuid(),
})
export const SaveQuickMessageSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  command: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use letras sem acentos, números, hífen ou sublinhado, sem /.'),
  message: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.trim().length > 0, 'Informe a mensagem.'),
})
