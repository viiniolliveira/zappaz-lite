import { z } from 'zod'
import { RateLimitedError } from '../common/errors/rate-limited-error.ts'
import { prisma } from '../db/prisma.ts'
import { logger } from '../lib/logger.ts'
import { authenticateRealtime, authorizeSession, requestUser } from '../middleware/auth.ts'
import { whatsappService } from '../services/whatsapp.ts'
import { createRealtimeBudgets } from './limits.ts'
import { registerLogHandlers } from './logs.ts'
import type { ChatServer, ChatSocket, SubscriptionAck } from './types.ts'

const SubscriptionSchema = z.strictObject({
  sessionId: z.string().min(1).max(1024),
})
export function chatEnvelope<T>(sessionId: string, data: T) {
  return {
    version: 1 as const,
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    sessionId,
    data,
  }
}
export async function socketCanAccess(socket: ChatSocket, sessionId: string) {
  if (!(socket.connected && socket.data.sessions.has(sessionId))) return false
  const session = await prisma.waSession.findUnique({
    where: { id: sessionId },
  })
  if (session && (await authorizeSession(socket.data.headers, session)))
    return socket.connected && socket.data.sessions.has(sessionId)
  socket.data.sessions.delete(sessionId)
  socket.emit('chat.session.revoked', { sessionId })
  return false
}
function connectionError() {
  return Object.assign(new Error('Access denied'), {
    data: { code: 'UNAUTHORIZED', message: 'Access denied' },
  })
}
function rateLimitedConnectionError() {
  return Object.assign(new Error('Too many realtime requests'), {
    data: {
      code: 'RATE_LIMITED',
      message: 'Too many realtime requests',
      retryAfterMs: 10000,
    },
  })
}
export function registerRealtimeHandlers(
  io: ChatServer,
  addressFor: (socket: ChatSocket) => string | undefined,
) {
  const budgetFor = createRealtimeBudgets()
  io.use((socket, next) => {
    const auth = z
      .strictObject({
        apiKey: z.string().min(1).max(1024).optional(),
      })
      .safeParse(socket.handshake.auth)
    if (
      !auth.success ||
      Object.keys(socket.handshake.query).some((key) => /token|authorization|api.?key/i.test(key))
    )
      return next(connectionError())
    const headers = new Headers()
    const apiKey = auth.data.apiKey ?? socket.handshake.headers['x-api-key']
    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string') return next(connectionError())
      headers.set('x-api-key', apiKey)
    }
    if (socket.handshake.headers.cookie) headers.set('cookie', socket.handshake.headers.cookie)
    // The transport integration resolves the IP under the shared proxy-trust policy.
    const address = addressFor(socket)
    if (!address) return next(connectionError())
    const finishHandshake = budgetFor(`address:${address}`)?.begin()
    if (!finishHandshake) return next(rateLimitedConnectionError())
    void requestUser(headers)
      .then((user) => {
        if (!user) return next(connectionError())
        const budget = budgetFor(`user:${user.id}`)
        const finish = budget?.begin()
        if (!finish || !budget) return next(rateLimitedConnectionError())
        const releaseConnection = budget.connect()
        finish()
        if (!releaseConnection) return next(rateLimitedConnectionError())
        if (socket.conn.readyState !== 'open') {
          releaseConnection()
          return next(rateLimitedConnectionError())
        }
        const release = () => {
          releaseConnection()
          socket.conn.off('close', release)
          socket.off('disconnect', release)
        }
        socket.conn.once('close', release)
        socket.once('disconnect', release)
        socket.data.headers = headers
        socket.data.sessions = new Set()
        socket.data.budget = budget
        next()
      })
      .catch((error: unknown) => {
        if (error instanceof RateLimitedError) return next(rateLimitedConnectionError())
        logger.error({ err: error, msg: 'Socket authentication failed' })
        next(connectionError())
      })
      .finally(finishHandshake)
  })
  io.on('connection', (socket) => {
    registerLogHandlers(socket)
    socket.on('chat.sync.acknowledge', (body, ack) => {
      if (typeof ack !== 'function') return
      const finish = socket.data.budget.begin()
      if (!finish) return ack({ ok: false })
      const parsed = SubscriptionSchema.extend({ errorId: z.uuid() }).safeParse(body)
      if (!parsed.success) {
        finish()
        return ack({ ok: false })
      }
      void (async () => {
        const { sessionId, errorId } = parsed.data
        if (!(await socketCanAccess(socket, sessionId))) return ack({ ok: false })
        whatsappService.acknowledgeHistorySyncError(sessionId, errorId)
        ack({ ok: true })
      })()
        .catch((error: unknown) => {
          logger.error({ err: error, msg: 'History sync acknowledgement failed' })
          ack({ ok: false })
        })
        .finally(finish)
    })
    const pending = new Map<string, symbol>()
    const subscription = async (
      body: unknown,
      ack: (response: SubscriptionAck) => void,
      subscribe: boolean,
    ) => {
      if (typeof ack !== 'function') return
      const finish = socket.data.budget.begin(subscribe)
      if (!finish)
        return ack({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many subscription requests',
          },
        })
      let sessionId: string | undefined
      let token: symbol | undefined
      try {
        const parsed = SubscriptionSchema.safeParse(body)
        if (!parsed.success)
          return ack({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid session subscription',
            },
          })
        sessionId = parsed.data.sessionId
        if (!subscribe) {
          pending.delete(sessionId)
          socket.data.sessions.delete(sessionId)
          return ack({ ok: true, data: { sessionId, subscribed: false } })
        }
        if (!socket.data.sessions.has(sessionId) && socket.data.sessions.size >= 100)
          return ack({
            ok: false,
            error: {
              code: 'RATE_LIMITED',
              message: 'Subscription limit reached',
            },
          })
        token = Symbol()
        pending.set(sessionId, token)
        const session = await prisma.waSession.findUnique({
          where: { id: sessionId },
        })
        if (!(session && (await authorizeSession(socket.data.headers, session))))
          return ack({
            ok: false,
            error: { code: 'FORBIDDEN', message: 'Access denied' },
          })
        if (!socket.connected || pending.get(sessionId) !== token) return
        if (socket.data.sessions.size >= 100 && !socket.data.sessions.has(sessionId))
          return ack({
            ok: false,
            error: { code: 'RATE_LIMITED', message: 'Subscription limit reached' },
          })
        socket.data.sessions.add(sessionId)
        ack({ ok: true, data: { sessionId, subscribed: true } })
        socket.emit(
          'chat.session.state',
          chatEnvelope(sessionId, {
            sessionId,
            connected: whatsappService.isSessionConnected(sessionId),
            enabled: session.enabled,
            ...whatsappService.getChatSyncState(sessionId),
          }),
        )
      } catch (error) {
        logger.error({ err: error, msg: 'Socket subscription failed' })
        ack({
          ok: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Subscription failed',
          },
        })
      } finally {
        if (sessionId && token && pending.get(sessionId) === token) pending.delete(sessionId)
        finish()
      }
    }
    socket.on('chat.session.subscribe', (body, ack) => {
      void subscription(body, ack, true)
    })
    socket.on('chat.session.unsubscribe', (body, ack) => {
      void subscription(body, ack, false)
    })
    socket.on('chat.presence.subscribe', (body, ack) => {
      if (typeof ack !== 'function') return
      const finish = socket.data.budget.begin()
      if (!finish) return ack({ ok: false })
      const parsed = SubscriptionSchema.extend({ conversationId: z.uuid() }).safeParse(body)
      if (!parsed.success) {
        finish()
        return ack({ ok: false })
      }
      void (async () => {
        const { sessionId, conversationId } = parsed.data
        if (!(await socketCanAccess(socket, sessionId))) return ack({ ok: false })
        const ok = await whatsappService.subscribeConversationPresence(sessionId, conversationId)
        ack({ ok })
      })()
        .catch((error: unknown) => {
          logger.error({ err: error, msg: 'Chat presence subscription failed' })
          ack({ ok: false })
        })
        .finally(finish)
    })
    socket.on('disconnect', () => {
      socket.data.sessions.clear()
      pending.clear()
    })
    let refreshing = false
    const timer = setInterval(() => {
      if (refreshing || !socket.connected) return
      const finish = socket.data.budget.acquireWork()
      if (!finish) return
      refreshing = true
      void (async () => {
        if (!(await authenticateRealtime(socket.data.headers))) return socket.disconnect(true)
        for (const sessionId of socket.data.sessions) await socketCanAccess(socket, sessionId)
      })()
        .catch((error: unknown) => {
          logger.error({ err: error, msg: 'Socket authorization refresh failed' })
          socket.disconnect(true)
        })
        .finally(() => {
          refreshing = false
          finish()
        })
    }, 15000)
    timer.unref()
    socket.once('disconnect', () => clearInterval(timer))
  })
}
