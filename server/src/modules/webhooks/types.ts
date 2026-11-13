import type { Webhook, WebhookLog } from '@generated/prisma'
import type { z } from 'zod'

import type {
  CreateWebhookBodySchema,
  GetWebhookLogsQuerySchema,
  GetWebhooksQuerySchema,
  UpdateWebhookBodySchema,
  WebhookLogParamsSchema,
} from './schema.ts'

export type WebhookEntity = Omit<Webhook, 'headers'> & {
  headers: Record<string, string>
  secret: string | null
}
export type WebhookLogEntity = WebhookLog
export type CreateWebhookInput = z.infer<typeof CreateWebhookBodySchema>
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookBodySchema>
export type GetWebhooksOptions = z.infer<typeof GetWebhooksQuerySchema>
export type GetWebhookLogsOptions = z.infer<typeof GetWebhookLogsQuerySchema>

export type PaginatedResult<T> = {
  data: T[]
  page: string
  pageSize: string
  total: number
}

export type RetryWebhookLogInput = z.infer<typeof WebhookLogParamsSchema>
