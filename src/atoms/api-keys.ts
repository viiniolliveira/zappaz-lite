import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { createApiKey, getApiKeySessions, getApiKeys, revokeApiKey } from '@/services/api-keys'

export const apiKeyKeys = { all: ['account', 'api-keys'] as const }

export const apiKeySessionsAtom = atomWithQuery(() => ({
  queryKey: ['sessions', 'api-key-options'],
  queryFn: ({ signal }) => getApiKeySessions(signal),
}))

export const apiKeysAtom = atomWithQuery(() => ({
  queryKey: apiKeyKeys.all,
  queryFn: ({ signal }) => getApiKeys(signal),
  retry: false,
}))

export const createApiKeyAtom = atomWithMutation((get) => ({
  mutationFn: createApiKey,
  gcTime: 0,
  onSuccess: () => {
    void get(queryClientAtom).invalidateQueries({ queryKey: apiKeyKeys.all })
    toast.success('Chave criada. Copie e guarde em um local seguro.')
  },
  onError: (error: Error) => toast.error(error.message),
}))

export const revokeApiKeyAtom = atomWithMutation((get) => ({
  mutationFn: revokeApiKey,
  onSuccess: () => {
    void get(queryClientAtom).invalidateQueries({ queryKey: apiKeyKeys.all })
    toast.success('Chave revogada.')
  },
  onError: (error: Error) => toast.error(error.message),
}))
