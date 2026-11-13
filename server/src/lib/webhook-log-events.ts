import type { WebhookLog } from '@generated/prisma'

export const WEBHOOK_LOG_CREATED_EVENT_TYPE = 'webhook-log.created' as const
export const WEBHOOK_LOG_CREATED_EVENT_VERSION = 1 as const

export type WebhookLogCreatedEventV1 = {
  version: typeof WEBHOOK_LOG_CREATED_EVENT_VERSION
  type: typeof WEBHOOK_LOG_CREATED_EVENT_TYPE
  data: {
    id: string
    url: string | null
    webhookId: string
    createdAt: string
    response: unknown
    event: string | null
    sessionId: string | null
    webhookDisplayName: string | null
    waSessionEventId: string | null
    payload: unknown | null
    messageId: string | null
  }
}

export function webhookLogCreatedChannel(sessionId: string, webhookId: string) {
  return `zappaz:webhook-log:created:${sessionId}:${webhookId}`
}

export function toWebhookLogCreatedEvent(log: WebhookLog): WebhookLogCreatedEventV1 {
  return {
    version: WEBHOOK_LOG_CREATED_EVENT_VERSION,
    type: WEBHOOK_LOG_CREATED_EVENT_TYPE,
    data: {
      id: log.id,
      url: log.url,
      webhookId: log.webhookId,
      createdAt: log.createdAt.toISOString(),
      response: log.response,
      event: log.event,
      sessionId: log.sessionId,
      webhookDisplayName: log.webhookDisplayName,
      waSessionEventId: log.waSessionEventId,
      payload: log.payload,
      messageId: log.messageId,
    },
  }
}
