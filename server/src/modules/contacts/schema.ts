import { z } from 'zod'
export const ContactQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(4096).optional(),
  q: z.string().max(200).default(''),
})
export const ContactParamsSchema = z.object({
  sessionId: z.string().min(1),
  contactId: z.uuid(),
})
export const SaveContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z
      .string()
      .trim()
      .max(254)
      .pipe(z.union([z.email(), z.literal('')]))
      .nullable()
      .optional(),
    annotations: z.string().trim().max(5000).nullable().optional(),
    phoneNumber: z
      .string()
      .max(40)
      .transform((value) => value.replace(/[+\s()-]/g, ''))
      .pipe(z.string().regex(/^[1-9]\d{6,14}$/, 'Informe o telefone com código do país e DDD')),
  })
  .strict()
export const UpdateContactSchema = SaveContactSchema.pick({
  name: true,
  email: true,
  annotations: true,
}).strict()
