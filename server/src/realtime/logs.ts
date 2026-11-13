import { z } from 'zod'
import { prisma } from '../db/prisma.ts'
import { logger } from '../lib/logger.ts'
import { type EventPayload, pubSub } from '../lib/pub-sub.ts'
import { webhookLogCreatedChannel } from '../lib/webhook-log-events.ts'
import { authorizeSessionById } from '../middleware/auth.ts'
import { requestRealtimeResync } from './reconciliation.ts'
import type { ChatSocket, LogSubscriptionAck } from './types.ts'

const schema = z.strictObject({
  sessionId: z.string().min(1).max(1024),
  webhookId: z.string().min(1).max(1024),
})

export function registerLogHandlers(socket: ChatSocket) {
  // The UI has one realtime log viewer per tab.
  let current: { sessionId: string; webhookId: string; dispose: () => void } | null = null
  let generation = 0
  const clear = () => {
    generation++
    current?.dispose()
    current = null
  }
  const allowed = async (sessionId: string, webhookId: string) =>
    !!(await prisma.webhook.findFirst({
      where: { id: webhookId, waSessionId: sessionId },
      select: { id: true },
    })) && (await authorizeSessionById(socket.data.headers, sessionId))

  const subscribe = async (body: unknown, ack: (response: LogSubscriptionAck) => void) => {
    if (typeof ack !== 'function') return
    const parsed = schema.safeParse(body)
    if (!parsed.success)
      return ack({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid log subscription' },
      })
    clear()
    const version = generation
    const { sessionId, webhookId } = parsed.data
    if (!(await allowed(sessionId, webhookId)))
      return ack({ ok: false, error: { code: 'FORBIDDEN', message: 'Access denied' } })
    if (!socket.connected || generation !== version) return
    const channel = webhookLogCreatedChannel(sessionId, webhookId)
    const handle = (event: EventPayload) => {
      if (
        !socket.connected ||
        generation !== version ||
        event.data.sessionId !== sessionId ||
        event.data.webhookId !== webhookId
      )
        return
      // Notifications are best-effort: drop on saturation rather than retaining a payload queue.
      const finish = socket.data.budget.acquireWork()
      if (!finish) {
        requestRealtimeResync(socket)
        return
      }
      void (async () => {
        const canAccess = await allowed(sessionId, webhookId)
        if (!socket.connected || generation !== version) return
        if (!canAccess) {
          clear()
          socket.emit('logs.revoked', { sessionId, webhookId })
          return
        }
        socket.emit('logs.entry', event)
      })()
        .catch((error: unknown) => logger.error({ err: error, msg: 'Log notification failed' }))
        .finally(finish)
    }
    pubSub.subscribe(channel, handle)
    current = { sessionId, webhookId, dispose: () => pubSub.unsubscribe(channel, handle) }
    ack({ ok: true, data: { sessionId, webhookId, subscribed: true } })
  }
  socket.on('logs.subscribe', (body, ack) => {
    if (typeof ack !== 'function') return
    const finish = socket.data.budget.begin()
    if (!finish)
      return ack({
        ok: false,
        error: { code: 'RATE_LIMITED', message: 'Too many subscription requests' },
      })
    void subscribe(body, ack)
      .catch((error: unknown) => {
        logger.error({ err: error, msg: 'Log subscription failed' })
        ack({ ok: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Subscription failed' } })
      })
      .finally(finish)
  })
  socket.on('logs.unsubscribe', (body, ack) => {
    const finish = socket.data.budget.begin(false)
    if (!finish) {
      if (typeof ack === 'function')
        ack({
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Too many subscription requests' },
        })
      return
    }
    try {
      const parsed = schema.safeParse(body)
      if (!parsed.success) return
      if (
        !current ||
        (current.sessionId === parsed.data.sessionId && current.webhookId === parsed.data.webhookId)
      )
        clear()
      if (typeof ack === 'function') ack({ ok: true, data: { ...parsed.data, subscribed: false } })
    } finally {
      finish()
    }
  })
  socket.once('disconnect', clear)
}
