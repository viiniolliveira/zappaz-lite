import { atomFamily } from 'jotai-family'
import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import type { CreateUserRequest, GetUsersParams, UpdateUserRequest } from '@/services/types'
import { createUser, deleteManagedUser, getUsers, updateManagedUser } from '@/services/users'
import { authKeys } from './auth-keys'

export const userManagementKeys = {
  all: ['user-management'] as const,
  list: (params: GetUsersParams) => [...userManagementKeys.all, 'list', params] as const,
}

export const getUsersAtom = atomFamily(
  (params: Required<Pick<GetUsersParams, 'page' | 'pageSize'>>) =>
    atomWithQuery(() => ({
      queryKey: userManagementKeys.list(params),
      queryFn: ({ signal }) => getUsers(params, signal),
    })),
  (first, second) => first.page === second.page && first.pageSize === second.pageSize,
)

export const createManagedUserAtom = atomWithMutation((get) => ({
  mutationKey: ['createManagedUser'],
  mutationFn: (req: CreateUserRequest) => createUser(req),
  onSuccess: () => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: userManagementKeys.all })
    toast.success('Usuário criado com sucesso.')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao criar usuário.')
  },
}))

export const updateManagedUserAtom = atomWithMutation((get) => ({
  mutationKey: ['updateManagedUser'],
  mutationFn: ({ userId, req }: { userId: string; req: UpdateUserRequest }) =>
    updateManagedUser(userId, req),
  onSettled: () => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: userManagementKeys.all })
    queryClient.invalidateQueries({ queryKey: authKeys.user() })
  },
  onSuccess: () => toast.success('Usuário atualizado com sucesso.'),
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao atualizar usuário.')
  },
}))

export const deleteManagedUserAtom = atomWithMutation((get) => ({
  mutationKey: ['deleteManagedUser'],
  mutationFn: (userId: string) => deleteManagedUser(userId),
  onSuccess: () => {
    const queryClient = get(queryClientAtom)
    queryClient.invalidateQueries({ queryKey: userManagementKeys.all })
    queryClient.invalidateQueries({ queryKey: authKeys.user() })
    toast.success('Usuário excluído com sucesso.')
  },
  onError: (error: Error) => {
    toast.error(error.message || 'Erro ao excluir usuário.')
  },
}))
