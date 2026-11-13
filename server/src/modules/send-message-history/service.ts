import { prisma } from '@db/prisma'
import { isValidDate, isValidDateRange } from '@lib/utils'
import { BadRequestError } from '@server/common/errors/bad-request-error'
import { ValidationError } from '@server/common/errors/validation-error'
import { DateTime } from 'luxon'

import type {
  GetSendMessageHistoryQuery,
  SendMessageHistoryResponse,
  WaSendMessageHistory,
} from './types.ts'

function aggregateByGranularity(
  data: WaSendMessageHistory[],
  granularity: GetSendMessageHistoryQuery['granularity'],
): SendMessageHistoryResponse {
  const response: SendMessageHistoryResponse = { total: 0, data: {} }

  for (const result of data) {
    const date = DateTime.fromJSDate(result.createdAt).startOf(granularity)
    let key = date.toFormat('yyyy-MM-dd')

    if (granularity === 'week') key = `${date.weekNumber}-${date.year}`
    if (granularity === 'month') key = `${date.month}-${date.year}`

    if (response.data[key]) response.data[key].push(result)
    else response.data[key] = [result]

    response.total++
  }

  return response
}

export async function getSendMessageHistory(
  sessionId: string,
  query: GetSendMessageHistoryQuery,
): Promise<SendMessageHistoryResponse> {
  if (!(isValidDate(query.startDate) && isValidDate(query.endDate))) {
    throw new ValidationError('Start and end date must be valid ISO 8601 dates')
  }

  if (!isValidDateRange(query.startDate, query.endDate)) {
    throw new BadRequestError('Start date must be before end date')
  }

  const data = await prisma.waSendMessageHistory.findMany({
    where: {
      sessionId: { equals: sessionId },
      createdAt: {
        gte: DateTime.fromISO(query.startDate).startOf('day').toJSDate(),
        lte: DateTime.fromISO(query.endDate).endOf('day').toJSDate(),
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return aggregateByGranularity(data, query.granularity)
}
