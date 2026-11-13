import { atomFamily } from 'jotai-family'
import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { connectSessionIdAtom } from '@/atoms/ui'
import {
  connectSession,
  createSession,
  getSendMessageHistory,
  getSessionById,
  getSessions,
  logoutSession,
  removeSession,
  updateSession,
} from '@/services/session'
import type { ConnectSession, CreateSessionRequest, UpdateSessionRequest } from '@/services/types'

export const sessionKeys = {
  all: ['sessions'] as const,
  list: () => [...sessionKeys.all, 'list'] as const,
  detail: (id: string) => [...sessionKeys.all, 'detail', id] as const,
  history: (id: string) => [...sessionKeys.all, 'history', id] as const,
}

// --- Queries ---

export const sessionsAtom = atomWithQuery(() => ({
  queryKey: sessionKeys.list(),
  retry: false,
  queryFn: async () => {
    return await getSessions()
  },
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 15, // 15 minutes
}))

export const getSessionByIdAtom = atomFamily((id: string) =>
  atomWithQuery(() => ({
    queryKey: sessionKeys.detail(id),
    queryFn: () => getSessionById(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 15, // 15 minutes
  })),
)

export const connectSessionQueryAtom = atomWithQuery((get) => {
  const id = get(connectSessionIdAtom)

  return {
    queryKey: id ? sessionKeys.detail(id) : ['session', 'none'],
    queryFn: async () => {
      if (!id) throw new Error('No session id')

      const result = await getSessionById(id)
      return result
    },
    enabled: !!id,
  }
})

export const getSessionHistoryAtom = atomFamily(
  (params: { id: string; granularity?: string; startDate?: string; endDate?: string }) =>
    atomWithQuery(() => ({
      queryKey: [
        ...sessionKeys.history(params.id),
        {
          granularity: params.granularity || 'day',
          startDate: params.startDate,
          endDate: params.endDate,
        },
      ],
      queryFn: async () => {
        return await getSendMessageHistory(
          params.id,
          params.granularity || 'day',
          params.startDate,
          params.endDate,
        )
      },
      retry: false,
      enabled: !!params.id,
    })),
  (a, b) =>
    a.id === b.id &&
    a.granularity === b.granularity &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate,
)

// --- Mutations ---

export const createSessionAtom = atomWithMutation((get) => ({
  mutationKey: ['createSession'],
  mutationFn: async (req: CreateSessionRequest) => {
    return await createSession(req)
  },
  onSuccess: () => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
    toast.success('Sessão criada com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao criar sessão')
  },
}))

export const updateSessionAtom = atomWithMutation((get) => ({
  mutationKey: ['updateSession'],
  mutationFn: async ({ id, req }: { id: string; req: UpdateSessionRequest }) => {
    return await updateSession(id, req)
  },
  onSuccess: async (_data, variables) => {
    const queryClient = get(queryClientAtom)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionKeys.list() }),
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables.id) }),
    ])
    toast.success('Sessão atualizada com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Falha ao atualizar sessão')
  },
}))

export const connectSessionAtom = atomWithMutation((get) => ({
  mutationKey: ['connectSession'],
  mutationFn: async (id: string) => {
    return await connectSession(id)
  },
  onSuccess: (_data: ConnectSession, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables) })
    queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Falha ao conectar sessão')
  },
}))

export const logoutSessionAtom = atomWithMutation((get) => ({
  mutationKey: ['logoutSession'],
  mutationFn: async (id: string) => {
    return await logoutSession(id)
  },
  onSuccess: async (_data, variables) => {
    const queryClient = get(queryClientAtom)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionKeys.list() }),
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables) }),
    ])
    toast.success('Sessão desconectada com sucesso')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Falha ao desconectar sessão')
  },
}))

export const removeSessionAtom = atomWithMutation((get) => ({
  mutationKey: ['removeSession'],
  mutationFn: async (id: string) => {
    return await removeSession(id)
  },
  onSuccess: (_data, variables) => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
    queryClient.invalidateQueries({ queryKey: sessionKeys.detail(variables) })
    toast.success('Sessão excluída permanentemente')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Falha ao excluir sessão')
  },
}))
