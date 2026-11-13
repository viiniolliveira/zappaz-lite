import { DateTime } from 'luxon'
import { z } from 'zod'
import { PageSchema, PageSizeSchema } from '../../common/pagination.ts'
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

export const CreateWebhookBodySchema = z.object({
  url: OutboundUrlSchema.describe('URL de destino das notificações.'),
  displayName: z.string().optional().describe('Nome de identificação do webhook.'),
  events: WebhookEventsSchema.describe('Eventos habilitados para entrega ao webhook.'),
  enabled: z.boolean().optional().default(false).describe('Indica se o webhook está habilitado.'),
  secret: WebhookSecretSchema.nullable()
    .optional()
    .describe('Segredo enviado no header X-Zappaz-Webhook-Secret.'),
  headers: WebhookHeadersSchema.optional()
    .default({})
    .describe('Cabeçalhos enviados nas notificações.'),
})

export const UpdateWebhookBodySchema = z.object({
  url: OutboundUrlSchema.optional().describe('Nova URL de destino das notificações.'),
  displayName: z.string().optional().describe('Novo nome de identificação do webhook.'),
  enabled: z.boolean().optional().describe('Indica se o webhook está habilitado.'),
  events: WebhookEventsSchema.optional().describe('Eventos habilitados para entrega ao webhook.'),
  secret: WebhookSecretSchema.nullable()
    .optional()
    .describe('Omitir preserva; null remove; string substitui o segredo.'),
  headers: WebhookHeadersSchema.optional().describe('Cabeçalhos enviados nas notificações.'),
})

export const SessionParamsSchema = z.object({
  sessionId: z.string(),
})

export const WebhookParamsSchema = SessionParamsSchema.extend({
  webhookId: z.string(),
})

export const WebhookLogParamsSchema = WebhookParamsSchema.extend({
  logId: z.string(),
})

export const GetWebhooksQuerySchema = z.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
})

export const GetWebhookLogsQuerySchema = z.object({
  event: z.string().optional(),
  status: z.string().optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
  startDate: z
    .string()
    .optional()
    .default(() => DateTime.now().minus({ days: 30 }).startOf('day').toISO()),
  endDate: z
    .string()
    .optional()
    .default(() => DateTime.now().endOf('day').toISO()),
})
