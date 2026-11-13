import type { z } from 'zod'
import type { SaveLabelSchema } from './schema.ts'

export type SaveLabelInput = z.infer<typeof SaveLabelSchema>
