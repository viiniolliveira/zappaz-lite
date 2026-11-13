import { request } from '@/lib/api-client'
import { authClient, unwrapAuthResult } from '@/lib/auth-client'
import type { PaginatedResponse, SessionSchema } from './types'

export async function getApiKeys(signal?: AbortSignal) {
  return unwrapAuthResult(
    await authClient.apiKey.list({
      query: { sortBy: 'createdAt', sortDirection: 'desc' },
      fetchOptions: { signal },
    }),
  )
}

export async function createApiKey(input: {
  name: string
  expiresIn?: number | null
  metadata: { scope: 'global' } | { scope: 'session'; sessionId: string }
}) {
  return unwrapAuthResult(await authClient.apiKey.create(input))
}

export async function getApiKeySessions(signal?: AbortSignal) {
  const sessions: SessionSchema[] = []
  for (const archived of ['false', 'true']) {
    let page = 1
    let result: PaginatedResponse<SessionSchema>
    do {
      result = await request<PaginatedResponse<SessionSchema>>(
        `/api/v1/session?archived=${archived}&page=${page}&pageSize=100`,
        { signal },
      )
      sessions.push(...result.data)
      page++
    } while ((page - 1) * 100 < Number(result.total))
  }
  return sessions
}

export async function revokeApiKey(keyId: string) {
  return unwrapAuthResult(await authClient.apiKey.delete({ keyId }))
}
