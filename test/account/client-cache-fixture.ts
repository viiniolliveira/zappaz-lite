import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/query-core'
import { createStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'

let activeFetch: typeof fetch = globalThis.fetch
globalThis.fetch = ((...args: Parameters<typeof fetch>) => activeFetch(...args)) as typeof fetch
const { authKeys, changePasswordAtom, updateUserAtom } = await import('../../src/atoms/auth.ts')
const { updateManagedUserAtom, userManagementKeys } = await import('../../src/atoms/users.ts')
const { apiKeyKeys, createApiKeyAtom, revokeApiKeyAtom } = await import('../../src/atoms/api-keys.ts')
const { getApiKeys } = await import('../../src/services/api-keys.ts')
const nativeUser = { id: 'u1', name: 'Maria', lastName: 'Silva', email: 'maria@example.com', phone: '5511999999999', role: 'USER', emailVerified: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const user = { id: nativeUser.id, firstName: nativeUser.name, lastName: nativeUser.lastName, email: nativeUser.email, phone: nativeUser.phone, role: nativeUser.role, createdAt: nativeUser.createdAt }

describe('account client and cache', () => {
  test('API keys use the official client and invalidate the list after creation and revocation', async () => {
    const requests: { url: string; data: unknown }[] = []
    let fail = false
    activeFetch = (async (url: string | URL | Request, options?: RequestInit) => {
      const path = String(url).split('?')[0]
      requests.push({ url: path, data: options?.body ? JSON.parse(String(options.body)) : undefined })
      if (fail) return Response.json({ message: 'Não foi possível revogar' }, { status: 403 })
      return Response.json(path.endsWith('/list') ? { apiKeys: [], total: 0 } : path.endsWith('/create') ? { id: 'key-1', key: 'secret' } : { success: true })
    }) as typeof fetch
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    store.set(queryClientAtom, client)
    const unsubscribe = store.sub(createApiKeyAtom, () => {})
    client.setQueryData(apiKeyKeys.all, { apiKeys: [], total: 0 })
    expect(await getApiKeys()).toEqual({ apiKeys: [], total: 0 })
    expect((await store.get(createApiKeyAtom).mutateAsync({ name: 'CRM', metadata: { scope: 'global' }, expiresIn: 86400 })).key).toBe('secret')
    store.get(createApiKeyAtom).reset()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(store.get(createApiKeyAtom).isPending).toBe(false)
    expect(client.getQueryState(apiKeyKeys.all)?.isInvalidated).toBe(true)
    client.setQueryData(apiKeyKeys.all, { apiKeys: [{ id: 'key-1' }], total: 1 })
    await store.get(revokeApiKeyAtom).mutateAsync('key-1')
    expect(client.getQueryState(apiKeyKeys.all)?.isInvalidated).toBe(true)
    expect(requests).toEqual([
      { url: '/api/auth/api-key/list', data: undefined },
      { url: '/api/auth/api-key/create', data: { name: 'CRM', metadata: { scope: 'global' }, expiresIn: 86400 } },
      { url: '/api/auth/api-key/delete', data: { keyId: 'key-1' } },
    ])
    fail = true
    await expect(store.get(revokeApiKeyAtom).mutateAsync('key-1')).rejects.toThrow('Não foi possível revogar')
    unsubscribe()
    client.clear()
  })
  test('uses native auth requests and updates profile and management cache', async () => {
    const requests: { url: string; data: unknown }[] = []
    activeFetch = (async (url: string | URL | Request, options?: RequestInit) => {
      const path = String(url).split('?')[0]
      requests.push({ url: path, data: options?.body ? JSON.parse(String(options.body)) : undefined })
      const data = path.endsWith('/get-session') ? { user: nativeUser, session: { id: 's1', userId: 'u1', token: 'token', expiresAt: '2030-01-01T00:00:00.000Z', createdAt: nativeUser.createdAt, updatedAt: nativeUser.updatedAt } } : { status: true }
      return Response.json(data)
    }) as typeof fetch
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    store.set(queryClientAtom, client)
    const list = userManagementKeys.list({ page: 1, pageSize: 10 })
    client.setQueryData(list, { data: [user] })
    await store.get(updateUserAtom).mutateAsync({ firstName: 'Maria', phone: '+5511999999999' })
    expect(requests[0]).toEqual({ url: '/api/auth/update-user', data: { name: 'Maria', phone: '5511999999999' } })
    expect(client.getQueryData(authKeys.user())).toEqual(user)
    expect(client.getQueryState(authKeys.user())?.isInvalidated).toBe(true)
    expect(client.getQueryState(list)?.isInvalidated).toBe(true)
    await store.get(changePasswordAtom).mutateAsync({ currentPassword: 'old-password', password: 'new-password' })
    expect(requests.at(-1)).toEqual({ url: '/api/auth/change-password', data: { currentPassword: 'old-password', newPassword: 'new-password', revokeOtherSessions: true } })
    client.clear()
  })

  test('invalidates profile and management caches when email change fails after profile update', async () => {
    const requests: { url: string; data: unknown }[] = []
    activeFetch = (async (url: string | URL | Request, options?: RequestInit) => {
      const path = String(url).split('?')[0]
      requests.push({ url: path, data: options?.body ? JSON.parse(String(options.body)) : undefined })
      if (path.endsWith('/change-email')) return Response.json({ message: 'Email unavailable' }, { status: 400 })
      if (path.endsWith('/get-session')) return Response.json({ user: nativeUser, session: { id: 's1', userId: 'u1', token: 'token', expiresAt: '2030-01-01T00:00:00.000Z', createdAt: nativeUser.createdAt, updatedAt: nativeUser.updatedAt } })
      return Response.json({ status: true })
    }) as typeof fetch
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    store.set(queryClientAtom, client)
    const list = userManagementKeys.list({ page: 1, pageSize: 10 })
    client.setQueryData(authKeys.user(), user)
    client.setQueryData(list, { data: [user] })
    await expect(store.get(updateUserAtom).mutateAsync({ firstName: 'Updated', email: 'new@example.com' })).rejects.toThrow('Email unavailable')
    expect(requests.map(request => request.url)).toEqual(['/api/auth/update-user', '/api/auth/get-session', '/api/auth/change-email'])
    expect(requests[0].data).toEqual({ name: 'Updated' })
    expect(requests[2].data).toEqual({ newEmail: 'new@example.com' })
    expect(client.getQueryState(authKeys.user())?.isInvalidated).toBe(true)
    expect(client.getQueryState(list)?.isInvalidated).toBe(true)
    client.clear()
  })

  test('editing the current user as administrator invalidates both management and auth data', async () => {
    const requests: string[] = []
    activeFetch = (async (url: string | URL | Request) => { requests.push(String(url)); return Response.json({ user: nativeUser }) }) as typeof fetch
    const store = createStore()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    store.set(queryClientAtom, client)
    const list = userManagementKeys.list({ page: 1, pageSize: 10 })
    client.setQueryData(authKeys.user(), { ...user, role: 'ADMIN' })
    client.setQueryData(list, { data: [user] })
    await store.get(updateManagedUserAtom).mutateAsync({ userId: user.id, req: { role: 'USER' } })
    expect(client.getQueryState(list)?.isInvalidated).toBe(true)
    expect(client.getQueryState(authKeys.user())?.isInvalidated).toBe(true)
    expect(requests).toEqual(['/api/auth/admin/set-role'])
    client.clear()
  })
})
