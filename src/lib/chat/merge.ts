import type { ConversationDTO, MessageDTO } from './schemas'

/** REST and realtime both use this merge; timestamps are never version numbers. */
export function mergeEntities<T extends { id: string; sessionId: string; revision: number }>(
  current: readonly T[],
  incoming: readonly T[],
  sessionId: string,
): T[] {
  const entities = new Map<string, T>()
  for (const item of [...current, ...incoming]) {
    if (item.sessionId !== sessionId) continue
    const previous = entities.get(item.id)
    if (!previous || item.revision > previous.revision) entities.set(item.id, item)
  }
  return [...entities.values()]
}

export function mergeMessages(
  current: readonly MessageDTO[],
  incoming: readonly MessageDTO[],
  sessionId: string,
  conversationId: string,
): MessageDTO[] {
  return mergeEntities(
    current.filter((item) => item.conversationId === conversationId),
    incoming.filter((item) => item.conversationId === conversationId),
    sessionId,
  ).sort((a, b) => a.orderAt.localeCompare(b.orderAt) || a.id.localeCompare(b.id))
}

export function mergeConversations(
  current: readonly ConversationDTO[],
  incoming: readonly ConversationDTO[],
  sessionId: string,
): ConversationDTO[] {
  return mergeEntities(current, incoming, sessionId)
    .filter((item) => item.isGroup === false)
    .sort(
      (a, b) =>
        (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || b.id.localeCompare(a.id),
    )
}

export const chatKeys = {
  all: ['chat'] as const,
  session: (sessionId: string) => ['chat', sessionId] as const,
  conversations: (sessionId: string, q = '', labelId: string | null = null) =>
    ['chat', sessionId, 'conversations', q, labelId] as const,
  conversation: (sessionId: string, conversationId: string) =>
    ['chat', sessionId, 'conversation', conversationId] as const,
  messages: (sessionId: string, conversationId: string) =>
    ['chat', sessionId, 'messages', conversationId] as const,
  contacts: (sessionId: string, q = '') => ['chat', sessionId, 'contacts', q] as const,
  avatar: (sessionId: string, contactId: string) =>
    ['chat', sessionId, 'avatar', contactId] as const,
  contactMedia: (sessionId: string, conversationId: string) =>
    ['chat', sessionId, 'contact-media', conversationId] as const,
}
