import { authClient, toUser, unwrapAuthResult } from '@/lib/auth-client'
import type { ChangePasswordRequest, LoginRequest, UpdateProfileRequest } from './types'

export async function getUser(signal?: AbortSignal) {
  return toUser(unwrapAuthResult(await authClient.getSession({ fetchOptions: { signal } })).user)
}

export async function login(body: LoginRequest) {
  unwrapAuthResult(await authClient.signIn.email(body))
  return { user: await getUser() }
}

export async function updateUser(body: UpdateProfileRequest) {
  const { email, firstName, ...profile } = body
  unwrapAuthResult(
    await authClient.updateUser({
      ...profile,
      name: firstName,
      phone: profile.phone?.replace('+', ''),
    }),
  )
  const current = await getUser()
  if (email && email !== current.email)
    unwrapAuthResult(await authClient.changeEmail({ newEmail: email }))
  return getUser()
}

export async function changePassword(body: ChangePasswordRequest) {
  return unwrapAuthResult(
    await authClient.changePassword({
      currentPassword: body.currentPassword,
      newPassword: body.password,
      revokeOtherSessions: true,
    }),
  )
}

export async function logout() {
  return unwrapAuthResult(await authClient.signOut())
}
