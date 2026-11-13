import { DateTime } from 'luxon'
import { z } from 'zod'

export const SendMessageHistoryParamsSchema = z.object({
  sessionId: z.string(),
})

export const GetSendMessageHistoryQuerySchema = z.object({
  startDate: z
    .string()
    .optional()
    .default(DateTime.now().minus({ days: 30 }).startOf('day').toISO()),
  endDate: z.string().optional().default(DateTime.now().endOf('day').toISO()),
  granularity: z.enum(['day', 'week', 'month']).optional().default('day'),
})
