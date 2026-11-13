import type { Server, Socket } from 'socket.io'
import type { ContactDTO, ConversationDTO, MediaDTO, MessageDTO } from '../lib/chat-contract.ts'
import type { WebhookLogCreatedEventV1 } from '../lib/webhook-log-events.ts'
import type { RealtimeBudget } from './limits.ts'

export interface ChatEvent<T> {
  version: 1
  eventId: string
  occurredAt: string
  sessionId: string
  data: T
}
export type SubscriptionAck =
  | { ok: true; data: { sessionId: string; subscribed: boolean } }
  | { ok: false; error: { code: string; message: string } }
export interface ClientEvents {
  'chat.presence.subscribe': (body: unknown, ack: (response: { ok: boolean }) => void) => void
  'chat.sync.acknowledge': (body: unknown, ack: (response: { ok: boolean }) => void) => void
  'logs.subscribe': (body: unknown, ack: (response: LogSubscriptionAck) => void) => void
  'logs.unsubscribe': (body: unknown, ack: (response: LogSubscriptionAck) => void) => void
  'chat.session.subscribe': (body: unknown, ack: (response: SubscriptionAck) => void) => void
  'chat.session.unsubscribe': (body: unknown, ack: (response: SubscriptionAck) => void) => void
}
export interface SessionState {
  sessionId: string
  connected: boolean
  enabled: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  syncProgress?: import('../lib/chat-history-sync.ts').HistorySyncProgress
}
export interface ServerEvents {
  'app.resync': (event: { version: 1 }) => void
  'chat.typing': (event: ChatEvent<{ conversationId: string }>) => void
  'chat.session.revoked': (event: { sessionId: string }) => void
  'logs.revoked': (event: { sessionId: string; webhookId: string }) => void
  'app.invalidate': (event: {
    version: 1
    eventId: string
    resource: 'sessions' | 'webhooks' | 'usage' | 'logs' | 'conversation-labels' | 'quick-messages'
    sessionId: string
    webhookId: string | null
    deleted: boolean
  }) => void
  'logs.entry': (event: WebhookLogCreatedEventV1) => void
  'chat.conversation.deleted': (
    event: ChatEvent<{ conversationId: string; deletedAt: string }>,
  ) => void
  'chat.contact.upserted': (event: ChatEvent<{ contact: ContactDTO }>) => void
  'chat.conversation.upserted': (event: ChatEvent<{ conversation: ConversationDTO }>) => void
  'chat.message.upserted': (
    event: ChatEvent<{
      message: MessageDTO
      source: 'live' | 'history' | 'send' | 'update'
    }>,
  ) => void
  'chat.media.updated': (event: ChatEvent<{ media: MediaDTO; message: MessageDTO }>) => void
  'chat.session.state': (event: ChatEvent<SessionState>) => void
}
export interface SocketData {
  headers: Headers
  sessions: Set<string>
  budget: RealtimeBudget
}
export type ChatServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>
export type ChatSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>

export type LogSubscriptionAck =
  | { ok: true; data: { sessionId: string; webhookId: string; subscribed: boolean } }
  | { ok: false; error: { code: string; message: string } }
