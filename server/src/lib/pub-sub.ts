import { EventEmitter } from 'node:events'
import type { WebhookLogCreatedEventV1 } from './webhook-log-events.ts'

export type EventPayload = WebhookLogCreatedEventV1

class PubSub {
  private emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  publish(channel: string, payload: EventPayload) {
    this.emitter.emit(channel, payload)
  }

  subscribe(channel: string, listener: (payload: EventPayload) => void) {
    this.emitter.on(channel, listener)
  }

  unsubscribe(channel: string, listener: (payload: EventPayload) => void) {
    this.emitter.off(channel, listener)
  }
}

export const pubSub = new PubSub()
