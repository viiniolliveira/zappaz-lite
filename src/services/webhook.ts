import { request } from '@/lib/api-client'
import type {
  CreateWebhookRequest,
  PaginatedResponse,
  UpdateWebhookRequest,
  Webhook,
  WebhookLog,
} from './types'

function payload(req: CreateWebhookRequest | UpdateWebhookRequest) {
  return {
    ...req,
    events: req.events ? Object.fromEntries(req.events.map((event) => [event, true])) : {},
  }
}

export const getWebhooks = (sessionId: string): Promise<PaginatedResponse<Webhook>> =>
  request<PaginatedResponse<Webhook>>(`/api/v1/session/${sessionId}/webhook`)

export const createWebhook = (sessionId: string, req: CreateWebhookRequest) =>
  request(`/api/v1/session/${sessionId}/webhook`, { method: 'POST', body: payload(req) })

export const updateWebhook = (sessionId: string, webhookId: string, req: UpdateWebhookRequest) =>
  request(`/api/v1/session/${sessionId}/webhook/${webhookId}`, {
    method: 'PUT',
    body: payload(req),
  })

export const deleteWebhook = (sessionId: string, webhookId: string) =>
  request(`/api/v1/session/${sessionId}/webhook/${webhookId}`, { method: 'DELETE' })

export const getWebhookLogs = (
  sessionId: string,
  webhookId: string,
  params: {
    page?: number
    pageSize?: number
    startDate?: string
    endDate?: string
    status?: number
    event?: string
  } = {},
) =>
  request<PaginatedResponse<WebhookLog>>(`/api/v1/session/${sessionId}/webhook/${webhookId}/logs`, {
    params,
  })

export const getWebhookLogById = (sessionId: string, webhookId: string, logId: string) =>
  request(`/api/v1/session/${sessionId}/webhook/${webhookId}/logs/${logId}`)

export const retryWebhookEvent = (sessionId: string, webhookId: string, logId: string) =>
  request(`/api/v1/session/${sessionId}/webhook/${webhookId}/logs/${logId}/retry`, {
    method: 'POST',
    body: {},
  })

export const webhook = {
  getWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookLogs,
  getWebhookLogById,
  retryWebhookEvent,
}
