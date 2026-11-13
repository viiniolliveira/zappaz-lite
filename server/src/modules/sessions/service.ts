import { prisma } from '@db/prisma'
import { waitUntil } from '@lib/utils'
import { BadRequestError } from '@server/common/errors/bad-request-error'
import { ForbiddenError } from '@server/common/errors/forbidden-error.ts'
import { NotFoundError } from '@server/common/errors/not-found-error'
import { UnauthorizedError } from '@server/common/errors/unauthorized-error'
import { InvalidSessionError, SessionNotFoundError } from '@services/errors'
import { whatsappService } from '@services/whatsapp'
import { v4 as uuid } from 'uuid'
import { publicSession } from './public-session.ts'
import type { CreateSessionInput, GetSessionsInput, UpdateSessionInput } from './types.ts'

function mapWhatsappError(error: unknown): never {
  if (error instanceof SessionNotFoundError || error instanceof InvalidSessionError) {
    throw new BadRequestError(error.message, error)
  }

  throw error
}

function withWhatsappErrorMapping<T>(operation: Promise<T>): Promise<T> {
  return operation.catch(mapWhatsappError)
}

function requireUser(user: GetSessionsInput['user']) {
  if (!user) throw new UnauthorizedError('Invalid user')
  return user
}

export async function createSession(user: GetSessionsInput['user'], data: CreateSessionInput) {
  const authenticatedUser = requireUser(user)
  if (authenticatedUser.apiKeyScope?.scope === 'session')
    throw new ForbiddenError('Scoped API keys cannot create sessions')
  if (authenticatedUser.role !== 'ADMIN' && !data.enabled) {
    throw new ForbiddenError('Only administrators can disable sessions')
  }
  const { session, storedSession } = await withWhatsappErrorMapping(
    whatsappService.createSession({
      id: uuid(),
      enabled: data.enabled,
      displayName: data.displayName,
      sessionConfig: data.config,
      userId: authenticatedUser.id,
    }),
  )

  if (session.enabled) {
    await waitUntil({
      topic: 'sessionReady',
      condition: () => Boolean(session.qrCodeBase64),
      callback: () => undefined,
      timeout: 30_000,
      interval: 500,
    })
  }

  return {
    ...publicSession(storedSession),
    status: session.status,
    qrCodeBase64: session.qrCodeBase64,
  }
}

export async function updateSession(
  user: GetSessionsInput['user'],
  sessionId: string,
  data: UpdateSessionInput,
) {
  const authenticatedUser = requireUser(user)
  if (authenticatedUser.role !== 'ADMIN' && data.enabled !== undefined) {
    throw new ForbiddenError('Only administrators can enable or disable sessions')
  }
  const session = await withWhatsappErrorMapping(
    whatsappService.updateSession({
      id: sessionId,
      enabled: data.enabled,
      displayName: data.displayName,
      sessionConfig: data.config,
    }),
  )

  return { ...publicSession(session), qrCodeBase64: whatsappService.getSessionQrCode(sessionId) }
}

export function archiveSession(sessionId: string) {
  return withWhatsappErrorMapping(whatsappService.archiveSession(sessionId))
}

export function unArchiveSession(sessionId: string) {
  return withWhatsappErrorMapping(whatsappService.unArchiveSession(sessionId))
}

export function removeSession(sessionId: string) {
  return withWhatsappErrorMapping(whatsappService.removeSession(sessionId))
}

export async function connectSession(sessionId: string) {
  const session = await withWhatsappErrorMapping(whatsappService.connectSession(sessionId))

  await waitUntil({
    topic: 'sessionReady',
    condition: () => Boolean(session.qrCodeBase64),
    callback: () => undefined,
    timeout: 30_000,
    interval: 250,
  })

  return { qrCodeBase64: session.qrCodeBase64 }
}

export function logoutSession(sessionId: string) {
  return withWhatsappErrorMapping(whatsappService.logoutSession(sessionId))
}

export async function getSessionById(sessionId: string) {
  const session = await prisma.waSession.findUnique({
    where: { id: sessionId },
    include: { config: true },
  })

  if (!session) throw new NotFoundError('Session not found')

  return {
    ...publicSession(session),
    qrCodeBase64: whatsappService.getSessionQrCode(sessionId),
  }
}

export async function getSessions({ query, user }: GetSessionsInput) {
  const authenticatedUser = requireUser(user)
  const take = Number.parseInt(query.pageSize, 10)
  const skip = (Number.parseInt(query.page, 10) - 1) * take
  const where = {
    id:
      authenticatedUser.apiKeyScope?.scope === 'session'
        ? authenticatedUser.apiKeyScope.sessionId
        : undefined,
    userId: authenticatedUser.role === 'ADMIN' ? undefined : authenticatedUser.id,
    archived: query.archived.toLowerCase() === 'true',
  }
  const [total, sessions] = await prisma.$transaction([
    prisma.waSession.count({ where }),
    prisma.waSession.findMany({
      where,
      orderBy: { displayName: 'asc' },
      include: { config: true },
      take,
      skip,
    }),
  ])

  return {
    status: 'success' as const,
    data: sessions.map(publicSession),
    page: query.page,
    pageSize: query.pageSize,
    total,
  }
}
