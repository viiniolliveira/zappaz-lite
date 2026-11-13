import { prisma } from '@db/prisma'
import { type BaileysEventMap, jidNormalizedUser } from 'baileys'
import { publishChatChange } from './chat-events.ts'
import { contactIdentifiers, conversationIdentityWhere } from './chat-identity.ts'

export async function publishReceivedTyping(
  sessionId: string,
  presence: BaileysEventMap['presence.update'],
  ownJids: readonly string[],
) {
  const jid = jidNormalizedUser(presence.id)
  const { phoneNumber, lid } = contactIdentifiers([jid])
  if (!(phoneNumber || lid) || ownJids.some((own) => jidNormalizedUser(own) === jid)) return
  const composing = Object.entries(presence.presences).some(
    ([participant, state]) =>
      jidNormalizedUser(participant) === jid && state.lastKnownPresence === 'composing',
  )
  if (!composing) return
  const conversation = await prisma.waConversation.findFirst({
    where: {
      sessionId,
      isGroup: false,
      messages: { some: {} },
      ...conversationIdentityWhere(jid),
    },
    select: { id: true },
  })
  if (conversation) publishChatChange({ sessionId, typing: { conversationId: conversation.id } })
}
