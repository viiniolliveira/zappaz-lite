import type { WaMessage } from '@generated/prisma'
import type { NormalizedMessage } from './whatsapp-event-normalizer.ts'

export type WebhookMessage = Omit<NormalizedMessage, 'id'> & {
  id: string | null
  messageId: string | null
  conversationId: string | null
}

export function webhookMessage(
  message: NormalizedMessage,
  record: Pick<WaMessage, 'id' | 'conversationId' | 'messageId'> | null | undefined,
): WebhookMessage {
  return {
    ...message,
    id: record?.id ?? null,
    messageId: record?.messageId ?? message.id,
    conversationId: record?.conversationId ?? null,
  }
}
