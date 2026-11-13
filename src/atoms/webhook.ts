import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import type { CreateWebhookRequest, UpdateWebhookRequest, Webhook } from '@/services/types'
import {
  createWebhook,
  deleteWebhook,
  getWebhookLogs,
  getWebhooks,
  retryWebhookEvent,
  updateWebhook,
} from '@/services/webhook'

export const webhookKeys = {
  all: ['webhooks'] as const,
  list: (sessionId: string) => [...webhookKeys.all, 'list', sessionId] as const,
  logs: (sessionId: string, webhookId: string) =>
    [...webhookKeys.all, 'logs', sessionId, webhookId] as const,
}

// --- Queries ---

import { atomFamily } from 'jotai-family'

export const getWebhooksAtom = atomFamily((sessionId: string) =>
  atomWithQuery(() => ({
    queryKey: webhookKeys.list(sessionId),
    queryFn: async () => {
      return await getWebhooks(sessionId)
    },
    enabled: !!sessionId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15,
    retry: 1,
  })),
)

export const getWebhookLogsAtom = atomFamily(
  (params: {
    sessionId: string
    webhookId: string
    page?: number
    pageSize?: number
    startDate?: string
    endDate?: string
    status?: number
    event?: string
  }) =>
    atomWithQuery(() => ({
      queryKey: [
        ...webhookKeys.logs(params.sessionId, params.webhookId),
        {
          page: params.page,
          pageSize: params.pageSize,
          startDate: params.startDate,
          endDate: params.endDate,
          status: params.status,
          event: params.event,
        },
      ],
      queryFn: async () => {
        return await getWebhookLogs(params.sessionId, params.webhookId, {
          page: params.page,
          pageSize: params.pageSize,
          startDate: params.startDate,
          endDate: params.endDate,
          status: params.status,
          event: params.event,
        })
      },
      enabled: !!params.sessionId && !!params.webhookId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  (a, b) =>
    a.sessionId === b.sessionId &&
    a.webhookId === b.webhookId &&
    a.page === b.page &&
    a.pageSize === b.pageSize &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.status === b.status &&
    a.event === b.event,
)

// --- Mutations ---

export const createWebhookAtom = atomWithMutation((get) => ({
  mutationKey: ['createWebhook'],
  mutationFn: async ({ sessionId, req }: { sessionId: string; req: CreateWebhookRequest }) => {
    return await createWebhook(sessionId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: webhookKeys.list(variables.sessionId),
    })
    toast.success('Webhook criado com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao criar webhook')
  },
}))

export const updateWebhookAtom = atomWithMutation((get) => ({
  mutationKey: ['updateWebhook'],
  mutationFn: async ({
    sessionId,
    webhookId,
    req,
  }: {
    sessionId: string
    webhookId: string
    req: UpdateWebhookRequest
  }) => {
    return await updateWebhook(sessionId, webhookId, req)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: webhookKeys.list(variables.sessionId),
    })
    toast.success('Webhook atualizado com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao atualizar webhook')
  },
}))

export const deleteWebhookAtom = atomWithMutation((get) => ({
  mutationKey: ['deleteWebhook'],
  mutationFn: async ({ sessionId, webhookId }: { sessionId: string; webhookId: string }) => {
    return await deleteWebhook(sessionId, webhookId)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({
      queryKey: webhookKeys.list(variables.sessionId),
    })
    toast.success('Webhook deletado com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao deletar webhook')
  },
}))

export const retryWebhookEventAtom = atomWithMutation(() => ({
  mutationKey: ['retryWebhookEvent'],
  mutationFn: async ({
    sessionId,
    webhookId,
    logId,
  }: {
    sessionId: string
    webhookId: string
    logId: string
  }) => {
    return await retryWebhookEvent(sessionId, webhookId, logId)
  },
  onSuccess: () => {
    toast.success('Webhook evento reenviado com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao retentar webhook evento')
  },
}))

import { atom } from 'jotai'

export const createWebhookModalOpenAtom = atom<boolean>(false)
export const editWebhookModalOpenAtom = atom<boolean>(false)
export const deleteWebhookModalOpenAtom = atom<boolean>(false)
export const selectedWebhookAtom = atom<Webhook | null>(null)
