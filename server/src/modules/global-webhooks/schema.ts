import { z } from 'zod'
import { WebhookHeadersSchema, WebhookSecretSchema } from '../../common/webhook-headers.ts'
import { OutboundUrlSchema } from '../../lib/outbound-policy.ts'

export const WebhookEventsSchema = z.object({
  call: z.boolean().optional().default(false),
  'blocklist.set': z.boolean().optional().default(false),
  'blocklist.update': z.boolean().optional().default(false),
  'chats.delete': z.boolean().optional().default(false),
  'chats.phoneNumberShare': z.boolean().optional().default(false),
  'chats.update': z.boolean().optional().default(false),
  'chats.upsert': z.boolean().optional().default(false),
  'connection.update': z.boolean().optional().default(false),
  'contacts.update': z.boolean().optional().default(false),
  'contacts.upsert': z.boolean().optional().default(false),
  'group-participants.update': z.boolean().optional().default(false),
  'group.join-request': z.boolean().optional().default(false),
  'groups.update': z.boolean().optional().default(false),
  'groups.upsert': z.boolean().optional().default(false),
  'labels.association': z.boolean().optional().default(false),
  'labels.edit': z.boolean().optional().default(false),
  'message-receipt.update': z.boolean().optional().default(false),
  'messages.delete': z.boolean().optional().default(false),
  'messages.media-update': z.boolean().optional().default(false),
  'messages.reaction': z.boolean().optional().default(false),
  'messages.send': z.boolean().optional().default(false),
  'messages.update': z.boolean().optional().default(false),
  'messaging-history.set': z.boolean().optional().default(false),
  'presence.update': z.boolean().optional().default(false),
  'inbound-message.upsert': z.boolean().optional().default(false),
  'outbound-message.upsert': z.boolean().optional().default(false),
})

export const CreateGlobalWebhookBodySchema = z.object({
  url: OutboundUrlSchema,
  events: WebhookEventsSchema,
  enabled: z.boolean().optional().default(false),
  secret: WebhookSecretSchema.nullable().optional(),
  headers: WebhookHeadersSchema.optional().default({}),
})

export const UpdateGlobalWebhookBodySchema = z.object({
  url: OutboundUrlSchema.optional(),
  enabled: z.boolean().optional(),
  events: WebhookEventsSchema.optional(),
  secret: WebhookSecretSchema.nullable().optional(),
  headers: WebhookHeadersSchema.optional(),
})

export const GlobalWebhookParamsSchema = z.object({
  webhookId: z.string(),
})
