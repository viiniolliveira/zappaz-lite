import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { createAuthClient } from 'better-auth/react'
import { z } from 'zod'
import type { auth } from '../../server/src/lib/auth'
import type { User } from '../services/types'
import { ApiError } from './api-error'

export const authClient = createAuthClient({
  plugins: [
    apiKeyClient(),
    adminClient({ roles: { ADMIN: adminAc, USER: userAc } }),
    inferAdditionalFields<typeof auth>(),
  ],
})

export function unwrapAuthResult<T>(result: {
  data: T | null
  error: { message?: string; status: number } | null
}): T {
  if (result.error)
    throw new ApiError(result.error.message ?? 'Erro de autenticação', result.error.status)
  if (!result.data) throw new ApiError('Sessão expirada, faça login novamente', 401)
  return result.data
}

const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  lastName: z.string(),
  phone: z.string().nullish(),
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.date(),
})

export function toUser(input: unknown): User {
  const user = userSchema.parse(input)
  return {
    id: user.id,
    email: user.email,
    firstName: user.name,
    lastName: user.lastName,
    phone: user.phone ?? null,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

import { apiKeyClient } from '@better-auth/api-key/client'
