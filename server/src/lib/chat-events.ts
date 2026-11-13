import { EventEmitter } from 'node:events'
import type { HistorySyncProgress } from './chat-history-sync.ts'
import { logger } from './logger.ts'

export interface ChatChange {
  typing?: { conversationId: string }
  messagesPruned?: boolean
  deletedConversation?: { conversationId: string; deletedAt: string }
  state?: {
    connected: boolean
    enabled: boolean
    syncStatus: 'idle' | 'syncing' | 'error'
    syncProgress?: HistorySyncProgress
  }
  sessionId: string
  conversationId?: string
  contactId?: string
  messageId?: string
  mediaId?: string
  source?: 'live' | 'history' | 'send' | 'update'
}
const events = new EventEmitter()
export function onChatChange(listener: (change: ChatChange) => Promise<void>) {
  const handle = (change: ChatChange) => {
    void listener(change).catch((error: unknown) =>
      logger.error({ err: error, msg: 'Chat notification failed' }),
    )
  }
  events.on('change', handle)
  return () => {
    events.off('change', handle)
  }
}
export function publishChatChange(change: ChatChange) {
  events.emit('change', change)
}
