import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { z } from 'zod'
import { prisma } from '../db/prisma.ts'
import { revokeUserApiKeys } from '../db/utils.ts'
import { apiKeyPermissions, apiKeyScopeSchema } from './api-key-scope.ts'

const name = z.string().trim().min(1).max(100)
const phone = z.string().regex(/^\d{7,15}$/)
const password = z.string().min(8).max(128)
const profile = z.strictObject({
  name: name.optional(),
  lastName: name.optional(),
  email: z.email().optional(),
  phone: phone.optional(),
})

export const authBodySchemas = {
  '/api-key/create': z.strictObject({
    name,
    metadata: apiKeyScopeSchema,
    expiresIn: z
      .number()
      .int()
      .min(3600)
      .max(86400 * 365)
      .nullable()
      .optional(),
  }),
  '/api-key/delete': z.strictObject({ keyId: z.string().min(1) }),
  '/update-user': profile.omit({ email: true }),
  '/change-password': z.strictObject({
    currentPassword: z.string().min(1),
    newPassword: password,
    revokeOtherSessions: z.boolean().optional(),
  }),
  '/admin/create-user': z.strictObject({
    email: z.email(),
    password,
    name,
    role: z.enum(['USER', 'ADMIN']).optional(),
    data: z.strictObject({ lastName: name, phone: phone.nullable().optional() }),
  }),
  '/admin/update-user': z.strictObject({
    userId: z.string().min(1),
    data: profile.extend({ phone: phone.nullable().optional() }),
  }),
  '/admin/set-user-password': z.strictObject({
    userId: z.string().min(1),
    newPassword: password,
  }),
  '/admin/set-role': z.strictObject({
    userId: z.string().min(1),
    role: z.enum(['USER', 'ADMIN']),
  }),
  '/admin/remove-user': z.strictObject({ userId: z.string().min(1) }),
}

export const authPolicy = createAuthMiddleware(async (ctx) => {
  if (ctx.path.startsWith('/api-key/')) {
    if (ctx.headers?.has('x-api-key')) throw new APIError('FORBIDDEN')
    const current = await getSessionFromCtx(ctx)
    if (!current) throw new APIError('UNAUTHORIZED')
    const actor = await prisma.user.findUnique({ where: { id: current.user.id } })
    if (!actor || actor.banned) throw new APIError('FORBIDDEN')
    const schema = Object.entries(authBodySchemas).find(([path]) => path === ctx.path)?.[1]
    if (!schema) return
    const parsed = schema.safeParse(ctx.body)
    if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Invalid API key input' })
    if (ctx.path === '/api-key/create' && 'metadata' in parsed.data)
      await apiKeyPermissions(actor.id, parsed.data.metadata)
    return { context: { body: parsed.data } }
  }
  if (ctx.path === '/update-user') {
    const parsed = authBodySchemas['/update-user'].safeParse(ctx.body)
    if (!(parsed.success && Object.keys(parsed.data).length))
      throw new APIError('BAD_REQUEST', { message: 'Invalid profile input' })
    return { context: { body: parsed.data } }
  }
  if (ctx.path === '/change-password') {
    const parsed = authBodySchemas['/change-password'].safeParse(ctx.body)
    if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Invalid password input' })
    return { context: { body: { ...parsed.data, revokeOtherSessions: true } } }
  }
  if (!ctx.path.startsWith('/admin/')) return
  const current = await getSessionFromCtx(ctx)
  if (!current) throw new APIError('UNAUTHORIZED')
  const actor = await prisma.user.findUnique({ where: { id: current.user.id } })
  if (!actor || actor.banned || actor.role !== 'ADMIN') throw new APIError('FORBIDDEN')

  if (ctx.path === '/admin/create-user') {
    const parsed = authBodySchemas['/admin/create-user'].safeParse(ctx.body)
    if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Invalid user input' })
    return { context: { body: parsed.data } }
  }
  if (ctx.path === '/admin/update-user') {
    const parsed = authBodySchemas['/admin/update-user'].safeParse(ctx.body)
    if (!(parsed.success && Object.keys(parsed.data.data).length))
      throw new APIError('BAD_REQUEST', { message: 'Invalid user input' })
    return { context: { body: parsed.data } }
  }
  if (ctx.path === '/admin/set-user-password') {
    const parsed = authBodySchemas['/admin/set-user-password'].safeParse(ctx.body)
    if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Invalid password input' })
    return { context: { body: parsed.data } }
  }
  if (!['/admin/remove-user', '/admin/set-role'].includes(ctx.path)) return
  const parsed = (
    ctx.path === '/admin/set-role'
      ? authBodySchemas['/admin/set-role']
      : authBodySchemas['/admin/remove-user']
  ).safeParse(ctx.body)
  if (!parsed.success) throw new APIError('BAD_REQUEST', { message: 'Invalid user input' })
  ctx.body = parsed.data
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  })
  if (!user) throw new APIError('NOT_FOUND', { message: 'User not found' })
  const demoting = 'role' in parsed.data && parsed.data.role !== 'ADMIN'
  if (user.role === 'ADMIN' && !user.banned && (demoting || ctx.path === '/admin/remove-user')) {
    const count = await prisma.user.count({
      where: { role: 'ADMIN', banned: false },
    })
    if (count <= 1)
      throw new APIError('CONFLICT', {
        message: 'Não é possível remover o último administrador.',
      })
  }
  if (ctx.path !== '/admin/remove-user') return
  if (user.id === actor.id)
    throw new APIError('BAD_REQUEST', {
      message: 'Não é possível excluir sua própria conta.',
    })
  // Block new access before external cleanup; retries can finish a failed deletion.
  await prisma.user.update({ where: { id: user.id }, data: { banned: true } })
  await prisma.authSession.deleteMany({ where: { userId: user.id } })
  const sessions = await prisma.waSession.findMany({
    where: { userId: user.id },
    select: { id: true },
  })
  for (const session of sessions) {
    const { removeSession } = await import('../modules/sessions/service.ts')
    await removeSession(session.id)
  }
})

export const authAfterPolicy = createAuthMiddleware(async (ctx) => {
  if (!['/admin/set-user-password', '/change-password'].includes(ctx.path)) return
  if (ctx.context.returned instanceof APIError) return
  if (ctx.path === '/change-password') {
    const current = await getSessionFromCtx(ctx)
    if (current) await prisma.$transaction(async (tx) => revokeUserApiKeys(current.user.id, tx))
    return
  }
  const parsed = z.object({ userId: z.string() }).safeParse(ctx.body)
  if (parsed.success) {
    await prisma.authSession.deleteMany({
      where: { userId: parsed.data.userId },
    })
    await prisma.$transaction(async (tx) => revokeUserApiKeys(parsed.data.userId, tx))
  }
})
