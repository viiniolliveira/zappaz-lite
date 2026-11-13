import { prisma } from '@db/prisma'
import { Prisma } from '@generated/prisma'
import { isValidDate, isValidDateRange } from '@lib/utils'
import { BadRequestError } from '@server/common/errors/bad-request-error'
import { NotFoundError } from '@server/common/errors/not-found-error'
import { whatsappService } from '@services/whatsapp'
import { DateTime } from 'luxon'
import { RateLimitedError } from '../../common/errors/rate-limited-error.ts'
import {
  publicWebhook,
  WEBHOOK_SECRET_HEADER,
  webhookHeaders,
} from '../../common/webhook-headers.ts'
import { publishAppInvalidation } from '../../lib/app-events.ts'

import type {
  CreateWebhookInput,
  GetWebhookLogsOptions,
  GetWebhooksOptions,
  PaginatedResult,
  RetryWebhookLogInput,
  UpdateWebhookInput,
  WebhookEntity,
  WebhookLogEntity,
} from './types.ts'

export async function getWebhooks(
  sessionId: string,
  { page, pageSize }: GetWebhooksOptions,
): Promise<PaginatedResult<WebhookEntity>> {
  const take = Number.parseInt(pageSize, 10)
  const skip = (Number.parseInt(page, 10) - 1) * take
  const where = { waSessionId: sessionId }
  const total = await prisma.webhook.count({ where })
  const data = await prisma.webhook.findMany({ where, take, skip })

  return { data: data.map(publicWebhook), page, pageSize, total }
}

export async function getWebhookById(sessionId: string, webhookId: string) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId, waSessionId: sessionId },
  })

  if (!webhook) throw new NotFoundError('Webhook not found')

  return publicWebhook(webhook)
}

export async function createWebhook(
  sessionId: string,
  data: CreateWebhookInput,
): Promise<WebhookEntity> {
  const session = await prisma.waSession.findUnique({
    where: { id: sessionId },
  })
  if (!session) throw new NotFoundError('Session not found')

  const webhook = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-quota:${session.userId}`}, 0))`
    const count = await tx.webhook.count({ where: { waSession: { userId: session.userId } } })
    const sessionCount = await tx.webhook.count({ where: { waSessionId: sessionId } })
    if (count >= 100 || sessionCount >= 20)
      throw new RateLimitedError('Webhook quota exceeded (100 per user, 20 per session)')
    const { secret, headers, ...values } = data
    return tx.webhook.create({
      data: { ...values, headers: webhookHeaders(headers, secret), waSessionId: sessionId },
    })
  })
  if (session.enabled) await whatsappService.loadWebhooks(sessionId)
  publishAppInvalidation({ resource: 'webhooks', sessionId, ownerId: session.userId })
  return publicWebhook(webhook)
}

export async function updateWebhook(
  sessionId: string,
  webhookId: string,
  data: UpdateWebhookInput,
): Promise<WebhookEntity> {
  const where = { id: webhookId, waSessionId: sessionId }
  const existing = await prisma.webhook.findUnique({ where })
  if (!existing) throw new NotFoundError('Webhook not found')
  const currentHeaders = existing.headers as Record<string, string>
  const currentSecret = currentHeaders[WEBHOOK_SECRET_HEADER]
  const headers = data.headers ?? publicWebhook(existing).headers

  const webhook = await prisma.webhook.update({
    where,
    data: {
      ...(data.url ? { url: data.url } : {}),
      ...(data.displayName ? { displayName: data.displayName } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.events ? { events: data.events } : {}),
      ...(data.headers !== undefined || data.secret !== undefined
        ? {
            headers: webhookHeaders(
              headers,
              data.secret === undefined ? currentSecret : data.secret,
            ),
          }
        : {}),
    },
  })
  await whatsappService.loadWebhooks(sessionId)
  const session = await prisma.waSession.findUniqueOrThrow({ where: { id: sessionId } })
  publishAppInvalidation({ resource: 'webhooks', sessionId, ownerId: session.userId })
  return publicWebhook(webhook)
}

export async function removeWebhook(sessionId: string, webhookId: string) {
  const where = { id: webhookId, waSessionId: sessionId }
  const webhook = await prisma.webhook.findUnique({ where })
  if (!webhook) throw new NotFoundError('Webhook not found')

  await prisma.webhook.delete({ where })
  await whatsappService.loadWebhooks(sessionId)
  const session = await prisma.waSession.findUniqueOrThrow({ where: { id: sessionId } })
  publishAppInvalidation({ resource: 'webhooks', sessionId, ownerId: session.userId })
}

export async function getWebhookLogById(sessionId: string, webhookId: string, logId: string) {
  const log = await prisma.webhookLog.findUnique({
    where: { id: logId, webhookId, sessionId },
  })

  if (!log) throw new NotFoundError('Webhook log not found')

  return log
}

export async function getWebhookLogs(
  sessionId: string,
  webhookId: string,
  options: GetWebhookLogsOptions,
): Promise<PaginatedResult<WebhookLogEntity>> {
  const { page, pageSize, startDate, endDate, event, status } = options

  if (!isValidDateRange(startDate, endDate)) {
    throw new BadRequestError('Start date must be before end date')
  }
  if (!(isValidDate(startDate) && isValidDate(endDate))) {
    throw new BadRequestError('Start and end date must be valid ISO 8601 dates')
  }

  const take = Number.parseInt(pageSize, 10)
  const skip = (Number.parseInt(page, 10) - 1) * take
  const where = {
    sessionId,
    webhookId,
    event,
    response: {
      path: ['status'],
      equals: status ? Number.parseInt(status, 10) : undefined,
      not: Prisma.DbNull,
    },
    createdAt: {
      gte: DateTime.fromISO(startDate).startOf('day').toJSDate(),
      lte: DateTime.fromISO(endDate).endOf('day').toJSDate(),
    },
  }
  const total = await prisma.webhookLog.count({ where })
  const data = await prisma.webhookLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  })

  return { data, page, pageSize, total }
}

export async function retryWebhookLog(input: RetryWebhookLogInput) {
  const log = await whatsappService.resendWebhookEvent(input)

  if (!log) {
    throw new NotFoundError('Webhook log not found or has no payload to retry')
  }

  return log
}
