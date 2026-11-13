import type { z } from 'zod'
import type { ContactQuerySchema, SaveContactSchema, UpdateContactSchema } from './schema.ts'
export type ContactQuery = z.infer<typeof ContactQuerySchema>
export type SaveContactInput = z.infer<typeof SaveContactSchema>
export type UpdateContactInput = z.infer<typeof UpdateContactSchema>
