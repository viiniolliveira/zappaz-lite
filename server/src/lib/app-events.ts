import { AsyncLocalStorage } from 'node:async_hooks'
import { EventEmitter } from 'node:events'
import { logger } from './logger.ts'

export interface RealtimeOrigin {
  socketId: string
  userId: string
}
export interface AppInvalidation {
  resource: 'sessions' | 'webhooks' | 'usage' | 'logs' | 'conversation-labels' | 'quick-messages'
  webhookId?: string
  sessionId: string
  ownerId: string | null
  deleted?: boolean
  origin?: RealtimeOrigin | null
}
const origin = new AsyncLocalStorage<RealtimeOrigin | undefined>()
const events = new EventEmitter()

export function runWithRealtimeOrigin<T>(value: RealtimeOrigin | undefined, work: () => T): T {
  return origin.run(value, work)
}

export function publishAppInvalidation(change: AppInvalidation) {
  events.emit('invalidate', {
    ...change,
    origin: change.origin === undefined ? origin.getStore() : change.origin,
  })
}

export function onAppInvalidation(listener: (change: AppInvalidation) => Promise<void>) {
  const handle = (change: AppInvalidation) => {
    void listener(change).catch((error: unknown) =>
      logger.error({ err: error, msg: 'App notification failed' }),
    )
  }
  events.on('invalidate', handle)
  return () => {
    events.off('invalidate', handle)
  }
}
