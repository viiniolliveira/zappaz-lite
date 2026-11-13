import { z } from 'zod'

export const webhookLogSchema = z.object({
  id: z.string().min(1),
  webhookId: z.string().min(1),
  sessionId: z.string().nullable(),
  url: z.string().nullable(),
  event: z.string().nullable(),
  response: z.looseObject({ status: z.number().optional() }).nullable(),
  payload: z.unknown(),
  webhookDisplayName: z.string().nullable(),
  waSessionEventId: z.string().nullable(),
  createdAt: z.iso.datetime(),
})

export const logEventSchema = z.object({
  version: z.literal(1),
  type: z.literal('webhook-log.created'),
  data: webhookLogSchema,
})

export const logSubscriptionAckSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    data: z.object({ sessionId: z.string(), webhookId: z.string(), subscribed: z.boolean() }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
])
