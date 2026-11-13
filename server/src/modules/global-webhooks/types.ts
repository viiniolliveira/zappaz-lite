import type { GlobalWebhook } from '@generated/prisma'
import type { z } from 'zod'

import type { CreateGlobalWebhookBodySchema, UpdateGlobalWebhookBodySchema } from './schema.ts'

export type GlobalWebhookEntity = Omit<GlobalWebhook, 'headers'> & {
  headers: Record<string, string>
  secret: string | null
}
export type CreateGlobalWebhookInput = z.infer<typeof CreateGlobalWebhookBodySchema>
export type UpdateGlobalWebhookInput = z.infer<typeof UpdateGlobalWebhookBodySchema>
