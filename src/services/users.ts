import { authClient, toUser, unwrapAuthResult } from '@/lib/auth-client'
import type { CreateUserRequest, GetUsersParams, UpdateUserRequest } from './types'

export async function getUsers(params: GetUsersParams = {}, signal?: AbortSignal) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 100
  const result = unwrapAuthResult(
    await authClient.admin.listUsers({
      query: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...(params.role
          ? { filterField: 'role', filterValue: params.role, filterOperator: 'eq' }
          : {}),
      },
      fetchOptions: { signal },
    }),
  )
  return { status: 'success', data: result.users.map(toUser), total: result.total, page, pageSize }
}

export async function createUser(body: CreateUserRequest) {
  return unwrapAuthResult(
    await authClient.admin.createUser({
      email: body.email,
      password: body.password,
      name: body.firstName,
      role: 'USER',
      data: {
        lastName: body.lastName,
        phone: body.phone === null ? null : body.phone?.replace('+', ''),
      },
    }),
  )
}

export async function updateManagedUser(userId: string, body: UpdateUserRequest) {
  const { password, role, firstName, ...profile } = body
  if (Object.keys(profile).length || firstName !== undefined)
    unwrapAuthResult(
      await authClient.admin.updateUser({
        userId,
        data: {
          ...profile,
          name: firstName,
          phone: profile.phone === null ? null : profile.phone?.replace('+', ''),
        },
      }),
    )
  if (password)
    unwrapAuthResult(await authClient.admin.setUserPassword({ userId, newPassword: password }))
  if (role !== undefined) unwrapAuthResult(await authClient.admin.setRole({ userId, role }))
}

export async function deleteManagedUser(userId: string) {
  return unwrapAuthResult(await authClient.admin.removeUser({ userId }))
}
