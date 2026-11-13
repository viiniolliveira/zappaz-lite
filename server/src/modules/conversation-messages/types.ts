import type { z } from 'zod'
import type { MediaQuerySchema, MessageQuerySchema, SendTextSchema } from './schema.ts'
export type MessageQuery = z.infer<typeof MessageQuerySchema>
export type MediaQuery = z.infer<typeof MediaQuerySchema>
export type SendText = z.infer<typeof SendTextSchema>
