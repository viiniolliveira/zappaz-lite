import { z } from 'zod'

export const WEBHOOK_SECRET_HEADER = 'X-Zappaz-Webhook-Secret'
export const WebhookSecretSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => !/[^\x21-\x7e]/.test(value), 'Use caracteres ASCII visíveis, sem espaços')

export const WebhookHeadersSchema = z
  .record(
    z
      .string()
      .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/)
      .max(100),
    z
      .string()
      .max(2048)
      .refine((value) => !/[\r\n]/.test(value)),
  )
  .refine(
    (headers) =>
      Object.keys(headers).length <= 20 &&
      !Object.keys(headers).some((key) =>
        [
          'host',
          'connection',
          'content-length',
          'transfer-encoding',
          'proxy-authorization',
          'upgrade',
          WEBHOOK_SECRET_HEADER.toLowerCase(),
        ].includes(key.toLowerCase()),
      ),
    'At most 20 headers; transport and webhook secret headers cannot be overridden',
  )

export function publicWebhook<T extends { headers: unknown }>(webhook: T) {
  const headers = webhook.headers as Record<string, string>
  const { [WEBHOOK_SECRET_HEADER]: secret, ...additionalHeaders } = headers
  return { ...webhook, headers: additionalHeaders, secret: secret ?? null }
}

export function webhookHeaders(headers: Record<string, string>, secret: string | null | undefined) {
  return secret ? { ...headers, [WEBHOOK_SECRET_HEADER]: secret } : headers
}
