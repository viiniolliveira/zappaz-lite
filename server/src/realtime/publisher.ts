import { prisma } from '../db/prisma.ts'
import { contactDTO, conversationDTO, messageDTO } from '../lib/chat-dto.ts'
import { type ChatChange, onChatChange } from '../lib/chat-events.ts'
import { chatEnvelope, socketCanAccess } from './handlers.ts'
import { requestRealtimeResync } from './reconciliation.ts'
import type { ChatServer } from './types.ts'

async function loadChatChange(change: ChatChange) {
  const conversation = change.conversationId
    ? // Retention must publish the empty snapshot to hide a previously visible conversation.
      await conversationDTO(change.sessionId, change.conversationId, !change.messagesPruned)
    : null
  const contact = change.contactId
    ? await prisma.waContact.findFirst({
        where: { sessionId: change.sessionId, id: change.contactId },
      })
    : null
  const stored = change.messageId
    ? await prisma.waMessage.findFirst({
        where: {
          sessionId: change.sessionId,
          id: change.messageId,
          conversation: { isGroup: false },
        },
        include: { media: true },
      })
    : null
  return { conversation, contact, message: stored ? messageDTO(stored) : null }
}

export function registerChatPublisher(io: ChatServer) {
  return onChatChange(async (change) => {
    let snapshot: ReturnType<typeof loadChatChange> | undefined
    for (const socket of io.sockets.sockets.values()) {
      if (!socket.connected || !socket.data.sessions.has(change.sessionId)) continue
      // Share admission with client operations; never enqueue notifications on saturation.
      const finish = socket.data.budget.acquireWork()
      if (!finish) {
        requestRealtimeResync(socket)
        continue
      }
      try {
        if (change.typing) {
          if (await socketCanAccess(socket, change.sessionId))
            socket.emit('chat.typing', chatEnvelope(change.sessionId, change.typing))
          continue
        }
        if (change.deletedConversation) {
          if (await socketCanAccess(socket, change.sessionId))
            socket.emit(
              'chat.conversation.deleted',
              chatEnvelope(change.sessionId, change.deletedConversation),
            )
          continue
        }
        // Load only after admission, and reuse the same snapshot across admitted subscribers.
        snapshot ??= loadChatChange(change)
        const { conversation, contact, message } = await snapshot
        if (!(await socketCanAccess(socket, change.sessionId))) continue
        if (change.state)
          socket.emit(
            'chat.session.state',
            chatEnvelope(change.sessionId, {
              sessionId: change.sessionId,
              ...change.state,
            }),
          )
        if (contact)
          socket.emit(
            'chat.contact.upserted',
            chatEnvelope(change.sessionId, { contact: contactDTO(contact) }),
          )
        if (message)
          socket.emit(
            'chat.message.upserted',
            chatEnvelope(change.sessionId, {
              message,
              source: change.source ?? 'update',
            }),
          )
        if (change.mediaId && message?.media)
          socket.emit(
            'chat.media.updated',
            chatEnvelope(change.sessionId, { media: message.media, message }),
          )
        if (conversation)
          socket.emit(
            'chat.conversation.upserted',
            chatEnvelope(change.sessionId, { conversation }),
          )
      } finally {
        finish()
      }
    }
  })
}
