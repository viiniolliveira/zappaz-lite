import { z } from 'zod'
import { config } from '../../config.ts'
import { allowedAppOrigins } from '../../lib/app-url.ts'
import { GetWebhookLogsQuerySchema } from '../webhooks/schema.ts'

export const McpPresetSchema = z.enum(['user', 'session'])
export const EmptyToolSchema = z.object({})
export const GroupToolSchema = z.object({
  groupId: z.string().min(1).describe('Identificador do grupo no WhatsApp.'),
})
export const MessageToolSchema = z.object({
  messageId: z.string().min(1).describe('Identificador da mensagem no WhatsApp.'),
})
export const WebhookToolSchema = z.object({
  webhookId: z.string().min(1).describe('Identificador do webhook da sessão.'),
})
export const WebhooksPageSchema = z.object({
  page: z.number().int().positive().default(1).describe('Número da página, começando em 1.'),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(100)
    .describe('Itens por página, até 100.'),
})
export const WebhookLogToolSchema = WebhookToolSchema.extend({
  logId: z.string().min(1).describe('Identificador do log de entrega do webhook.'),
})
export const WebhookLogsToolSchema = WebhookToolSchema.extend({
  ...GetWebhookLogsQuerySchema.omit({ page: true, pageSize: true }).shape,
  ...WebhooksPageSchema.shape,
  page: z.number().int().positive().max(10000).default(1),
})
export const GroupPictureSchema = z.object({
  identifier: z.string().min(1).describe('Identificador do grupo no WhatsApp.'),
  source: z.string().min(1).describe('URL da imagem ou conteúdo da imagem codificado em base64.'),
})

const isProduction = config.isProduction
const hosts = [
  ...new Set(
    allowedAppOrigins(config.appUrl, isProduction).map((origin) => new URL(origin).hostname),
  ),
]
if (!isProduction) hosts.push('[::1]')

export const mcpHttpOptions = {
  allowedHosts: hosts,
  allowedOrigins: hosts,
}
