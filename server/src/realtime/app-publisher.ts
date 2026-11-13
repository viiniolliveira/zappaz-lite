import { RateLimitedError } from '../common/errors/rate-limited-error.ts'
import { UnauthorizedError } from '../common/errors/unauthorized-error.ts'
import { onAppInvalidation } from '../lib/app-events.ts'
import { requestUser } from '../middleware/auth.ts'
import { requestRealtimeResync } from './reconciliation.ts'
import type { ChatServer } from './types.ts'

export function registerAppPublisher(io: ChatServer) {
  return onAppInvalidation(async (change) => {
    const event = {
      version: 1 as const,
      eventId: crypto.randomUUID(),
      resource: change.resource,
      sessionId: change.sessionId,
      webhookId: change.webhookId ?? null,
      deleted: change.deleted ?? false,
    }
    await Promise.all(
      [...io.sockets.sockets.values()].map(async (socket) => {
        if (!socket.connected) return
        const finish = socket.data.budget.acquireWork()
        if (!finish) {
          requestRealtimeResync(socket)
          return
        }
        try {
          let user: Awaited<ReturnType<typeof requestUser>>
          try {
            user = await requestUser(socket.data.headers)
          } catch (error) {
            if (error instanceof UnauthorizedError || error instanceof RateLimitedError) return
            throw error
          }
          if (!user || !socket.connected || (user.role !== 'ADMIN' && user.id !== change.ownerId))
            return
          if (
            user.apiKeyScope?.scope === 'session' &&
            user.apiKeyScope.sessionId !== change.sessionId
          )
            return
          if (socket.id === change.origin?.socketId && user.id === change.origin.userId) return
          socket.emit('app.invalidate', event)
        } finally {
          finish()
        }
      }),
    )
  })
}
