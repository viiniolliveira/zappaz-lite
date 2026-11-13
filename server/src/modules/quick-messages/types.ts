import type { z } from 'zod'
import type { SaveQuickMessageSchema } from './schema.ts'

export type SaveQuickMessageInput = z.infer<typeof SaveQuickMessageSchema>
