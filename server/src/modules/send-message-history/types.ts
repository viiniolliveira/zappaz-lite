import type { WaSendMessageHistory as PrismaWaSendMessageHistory } from '@generated/prisma'
import type { z } from 'zod'

import type { GetSendMessageHistoryQuerySchema, SendMessageHistoryParamsSchema } from './schema.ts'

export type WaSendMessageHistory = PrismaWaSendMessageHistory
export type GetSendMessageHistoryQuery = z.infer<typeof GetSendMessageHistoryQuerySchema>
export type SendMessageHistoryParams = z.infer<typeof SendMessageHistoryParamsSchema>
export type SendMessageHistoryDataKey = string

export interface SendMessageHistoryResponse {
  total: number
  data: Record<SendMessageHistoryDataKey, WaSendMessageHistory[]>
}
