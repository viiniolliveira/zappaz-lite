import type { User, WaSession } from '@generated/prisma'
import { APIError } from 'better-auth/api'
import { z } from 'zod'
import { prisma } from '../db/prisma.ts'

export const apiKeyScopeSchema = z.discriminatedUnion('scope', [
  z.strictObject({ scope: z.literal('global') }),
  z.strictObject({ scope: z.literal('session'), sessionId: z.string().min(1).max(1024) }),
])

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>
export type AuthUser = User & { apiKeyScope?: ApiKeyScope }

export async function apiKeyPermissions(
  userId: string,
  metadata: unknown,
): Promise<Record<string, string[]>> {
  const parsed = apiKeyScopeSchema.safeParse(metadata)
  if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Select an API key scope' })
  const actor = await prisma.user.findUnique({ where: { id: userId } })
  if (!actor || actor.banned) throw new APIError('FORBIDDEN')
  if (parsed.data.scope === 'global') return { global: ['sessions'] }
  const session = await prisma.waSession.findUnique({ where: { id: parsed.data.sessionId } })
  if (!session || (actor.role !== 'ADMIN' && session.userId !== actor.id))
    throw new APIError('FORBIDDEN')
  return { sessions: [session.id] }
}

export function parseApiKeyPermissions(permissions: unknown): ApiKeyScope | null {
  const global = z.strictObject({ global: z.tuple([z.literal('sessions')]) }).safeParse(permissions)
  if (global.success) return { scope: 'global' }
  const scoped = z
    .strictObject({ sessions: z.tuple([z.string().min(1).max(1024)]) })
    .safeParse(permissions)
  return scoped.success ? { scope: 'session', sessionId: scoped.data.sessions[0] } : null
}

export function canAccessSession(user: AuthUser, session: Pick<WaSession, 'id' | 'userId'>) {
  return (
    !user.banned &&
    (user.role === 'ADMIN' || user.id === session.userId) &&
    (user.apiKeyScope?.scope !== 'session' || user.apiKeyScope.sessionId === session.id)
  )
}
