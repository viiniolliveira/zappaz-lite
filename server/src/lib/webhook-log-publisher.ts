import type { WebhookLog } from '@generated/prisma'
import { logger } from '@lib/logger'
import { pubSub } from '@lib/pub-sub'
import { toWebhookLogCreatedEvent, webhookLogCreatedChannel } from '@lib/webhook-log-events'

export async function publishWebhookLogCreated(log: WebhookLog): Promise<void> {
  let channel: string | undefined

  try {
    if (!log.sessionId) {
      throw new Error('Cannot publish webhook log without a sessionId')
    }

    channel = webhookLogCreatedChannel(log.sessionId, log.webhookId)
    const event = toWebhookLogCreatedEvent(log)

    pubSub.publish(channel, event)
  } catch (error) {
    logger.warn({
      msg: 'Failed to publish webhook log created event',
      error: error instanceof Error ? error.message : error,
      extra: {
        source: 'webhook-log-publisher',
        function: 'publishWebhookLogCreated',
        logId: log.id,
        sessionId: log.sessionId,
        webhookId: log.webhookId,
        ...(channel ? { channel } : {}),
      },
    })
  }
}
