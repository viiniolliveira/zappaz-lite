import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  CreateSessionBodySchema,
  GetSessionsQuerySchema,
  SessionParamsSchema,
  UpdateSessionBodySchema,
} from './schema.ts'
import {
  archiveSession,
  connectSession,
  createSession,
  getSessionById,
  getSessions,
  logoutSession,
  removeSession,
  unArchiveSession,
  updateSession,
} from './service.ts'

export async function createSessionController(c: Context<AppEnv>) {
  const data = CreateSessionBodySchema.parse(await c.req.json())
  const session = await createSession(c.get('user'), data)

  return c.json(session, 200)
}

export async function updateSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const data = UpdateSessionBodySchema.parse(await c.req.json())
  const session = await updateSession(c.get('user'), sessionId, data)

  return c.json(session, 200)
}

export async function archiveSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  await archiveSession(sessionId)

  return c.json({
    status: 'success',
    message: `Session archived: ${sessionId}`,
  })
}

export async function unArchiveSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  await unArchiveSession(sessionId)

  return c.json({
    status: 'success',
    message: `Session un-archived: ${sessionId}`,
  })
}

export async function removeSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  await removeSession(sessionId)

  return c.json({
    status: 'success',
    message: `Session removed: ${sessionId}`,
  })
}

export async function connectSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const session = await connectSession(sessionId)

  return c.json(session, 200)
}

export async function logoutSessionController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  await logoutSession(sessionId)

  return c.json({
    status: 'success',
    message: `Session logged out: ${sessionId}`,
  })
}

export async function getSessionByIdController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const session = await getSessionById(sessionId)

  return c.json(session, 200)
}

export async function getSessionsController(c: Context<AppEnv>) {
  const query = GetSessionsQuerySchema.parse(c.req.query())
  const sessions = await getSessions({ query, user: c.get('user') })

  return c.json(sessions, 200)
}
