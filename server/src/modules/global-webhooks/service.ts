import { prisma } from '@db/prisma'
import { NotFoundError } from '@server/common/errors/not-found-error'
import { whatsappService } from '@services/whatsapp'
import { RateLimitedError } from '../../common/errors/rate-limited-error.ts'
import {
  publicWebhook,
  WEBHOOK_SECRET_HEADER,
  webhookHeaders,
} from '../../common/webhook-headers.ts'

import type {
  CreateGlobalWebhookInput,
  GlobalWebhookEntity,
  UpdateGlobalWebhookInput,
} from './types.ts'

export async function getGlobalWebhooks(): Promise<GlobalWebhookEntity[]> {
  return (await prisma.globalWebhook.findMany()).map(publicWebhook)
}

export async function createGlobalWebhook(
  data: CreateGlobalWebhookInput,
): Promise<GlobalWebhookEntity> {
  const webhook = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('global-webhook-quota', 0))`
    if ((await tx.globalWebhook.count()) >= 50)
      throw new RateLimitedError('Maximum 50 global webhooks')
    const { secret, headers, ...values } = data
    return tx.globalWebhook.create({
      data: { ...values, headers: webhookHeaders(headers, secret) },
    })
  })
  await whatsappService.loadGlobalWebhooks()
  return publicWebhook(webhook)
}

export async function updateGlobalWebhook(
  webhookId: string,
  data: UpdateGlobalWebhookInput,
): Promise<GlobalWebhookEntity> {
  const existing = await prisma.globalWebhook.findUnique({ where: { id: webhookId } })
  if (!existing) throw new NotFoundError('Global webhook not found')
  const currentSecret = (existing.headers as Record<string, string>)[WEBHOOK_SECRET_HEADER]
  const headers = data.headers ?? publicWebhook(existing).headers

  const webhook = await prisma.globalWebhook.update({
    where: { id: webhookId },
    data: {
      ...(data.url ? { url: data.url } : {}),
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
  await whatsappService.loadGlobalWebhooks()
  return publicWebhook(webhook)
}

export async function removeGlobalWebhook(webhookId: string) {
  const webhook = await prisma.globalWebhook.findUnique({
    where: { id: webhookId },
  })
  if (!webhook) throw new NotFoundError('Global webhook not found')

  await prisma.globalWebhook.delete({ where: { id: webhookId } })
  await whatsappService.loadGlobalWebhooks()
}
