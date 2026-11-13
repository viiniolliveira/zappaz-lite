import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-error'
import { chatDraftStorage, chatDraftStorageKey } from '@/lib/chat/draft-storage'
import { changePassword, getUser, login, logout, updateUser } from '@/services/auth'
import type {
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  UpdateProfileRequest,
} from '@/services/types'
import { authKeys } from './auth-keys'
import { sessionKeys } from './session'
import { userManagementKeys } from './users'

export { authKeys } from './auth-keys'

// --- Queries ---

export const userAtom = atomWithQuery(() => ({
  queryKey: authKeys.user(),
  queryFn: ({ signal }) => getUser(signal),
  retry: false,
  onError: (error: Error) => {
    if (error instanceof ApiError && error.status === 401) {
      toast.error('Sessão expirada, faça login novamente')
    } else {
      toast.error(error.message || 'Erro ao buscar dados do usuário')
    }
  },
}))

// --- Mutations ---

export const loginAtom = atomWithMutation((get) => ({
  mutationKey: ['login'],
  mutationFn: async (req: LoginRequest) => {
    return login(req)
  },
  onSuccess: (data: LoginResponse) => {
    const queryClient = get(queryClientAtom)
    queryClient.setQueryData(authKeys.user(), data.user)
    queryClient.invalidateQueries({ queryKey: sessionKeys.all })
  },
  onError(error) {
    toast.error(error instanceof Error ? error.message : 'Erro ao fazer login ')
  },
}))

export const updateUserAtom = atomWithMutation((get) => ({
  mutationKey: ['updateUser'],
  mutationFn: async (req: UpdateProfileRequest) => {
    return updateUser(req)
  },
  onSuccess: (user) => {
    const queryClient = get(queryClientAtom)
    queryClient.setQueryData(authKeys.user(), user)
    toast.success('Informações atualizadas com sucesso.')
  },
  onSettled: () => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: authKeys.user() })
    queryClient.invalidateQueries({ queryKey: userManagementKeys.all })
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao atualizar informações.')
  },
}))

export const changePasswordAtom = atomWithMutation(() => ({
  mutationKey: ['changePassword'],
  mutationFn: (req: ChangePasswordRequest) => changePassword(req),
  onSuccess: () => toast.success('Senha alterada com sucesso.'),
  onError: (error: Error) => toast.error(error.message || 'Não foi possível alterar a senha.'),
}))

export const logoutAtom = atomWithMutation((get) => ({
  mutationKey: ['logout'],
  mutationFn: async () => {
    await logout()
  },
  onSuccess: () => {
    const queryClient = get(queryClientAtom)
    // Clear all queries on logout to ensure no sensitive data is kept in cache
    queryClient.clear()
    chatDraftStorage.removeItem(chatDraftStorageKey)
    window.location.href = '/sign-in' // Redirect to login page after logout
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao encerrar a sessão')
  },
}))
