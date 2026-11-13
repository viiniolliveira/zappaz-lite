import { prisma } from '@db/prisma'
import type { WaContact, WaMessage, WaMessageMedia } from '@generated/prisma'
import { ContactSchema, ConversationSchema, MediaSchema, MessageSchema } from './chat-contract.ts'
import { normalizeMessageStatus } from './whatsapp-event-normalizer.ts'

export function contactDTO(contact: WaContact) {
  return ContactSchema.parse({
    ...contact,
    avatarCheckedAt: contact.avatarCheckedAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
    displayName:
      contact.localName || contact.name || contact.pushName || contact.phoneNumber || contact.jid,
  })
}
export function mediaDTO(media: WaMessageMedia) {
  return MediaSchema.parse({
    ...media,
    messageRecordId: media.messageId,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
    thumbnail:
      media.thumbnailBase64 && media.thumbnailMimeType === 'image/jpeg'
        ? {
            base64: media.thumbnailBase64,
            mimeType: media.thumbnailMimeType,
            width: media.thumbnailWidth,
            height: media.thumbnailHeight,
          }
        : null,
    contentPath: `/api/v1/session/${encodeURIComponent(media.sessionId)}/conversations/${media.conversationId}/media/${media.id}/content`,
  })
}
export function messageDTO(message: WaMessage & { media: WaMessageMedia | null }) {
  const content =
    message.content && typeof message.content === 'object' && !Array.isArray(message.content)
      ? message.content
      : {}
  const reply =
    content.replyTo && typeof content.replyTo === 'object' && !Array.isArray(content.replyTo)
      ? content.replyTo
      : null
  const replyMedia =
    reply?.media && typeof reply.media === 'object' && !Array.isArray(reply.media)
      ? reply.media
      : null
  const location =
    content.location && typeof content.location === 'object' && !Array.isArray(content.location)
      ? content.location
      : null
  const deleted = !!message.deletedAt
  return MessageSchema.parse({
    ...message,
    text: deleted ? null : message.text,
    hasLink: !deleted && message.hasLink,
    linkPreview: deleted ? null : (content.linkPreview ?? null),
    interactive: deleted ? null : (content.interactive ?? null),
    poll: deleted ? null : (content.poll ?? null),
    album: deleted ? null : (content.album ?? null),
    groupInvite: deleted ? null : (content.groupInvite ?? null),
    system: deleted ? null : (content.system ?? null),
    unavailable: deleted ? null : (content.unavailable ?? null),
    selection: deleted ? null : (content.selection ?? null),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    sentAt: message.sentAt?.toISOString() ?? null,
    orderAt: message.orderAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    sender: { jid: message.senderJid, name: message.senderName },
    status: normalizeMessageStatus(message.status) ?? null,
    media: !deleted && message.media ? mediaDTO(message.media) : null,
    replyTo:
      !deleted && reply
        ? {
            messageRecordId: null,
            messageId: reply.id,
            senderJid: reply.senderId ?? null,
            fromMe: reply.fromMe ?? null,
            type: reply.type === 'reaction' ? 'unknown' : (reply.type ?? 'unknown'),
            text: reply.text ?? null,
            contacts: reply.type === 'contact' ? reply.contacts : [],
            media: replyMedia
              ? {
                  mimeType: replyMedia.mimeType ?? null,
                  fileName: replyMedia.fileName ?? null,
                  thumbnail: replyMedia.thumbnail ?? null,
                }
              : null,
          }
        : null,
    location:
      !deleted && location
        ? {
            ...location,
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
            name: location.name ?? null,
            address: location.address ?? null,
            url: location.url ?? null,
            thumbnail: location.thumbnail ?? null,
          }
        : null,
    contacts: !deleted && message.type === 'contact' ? content.contacts : [],
    mentions: deleted ? [] : (content.mentions ?? []),
    reactions: deleted ? [] : (content.reactions ?? []),
  })
}

export async function conversationDTO(
  sessionId: string,
  conversationId: string,
  onlyWithMessages = false,
) {
  const conversation = await prisma.waConversation.findFirst({
    where: {
      sessionId,
      id: conversationId,
      isGroup: false,
      ...(onlyWithMessages ? { messages: { some: { sessionId } } } : {}),
    },
    include: { contact: true, labels: true },
  })
  if (!conversation) return null
  const lastMessage = conversation.lastMessageId
    ? await prisma.waMessage.findFirst({
        where: { sessionId, conversationId, id: conversation.lastMessageId },
        include: { media: true },
      })
    : null
  const contact = conversation.contact ? contactDTO(conversation.contact) : null
  return ConversationSchema.parse({
    ...conversation,
    labelIds: conversation.labels.map((link) => link.labelId),
    contact,
    displayName: contact?.displayName ?? conversation.jid,
    avatarUrl: contact?.avatarUrl ?? null,
    lastMessage: lastMessage ? messageDTO(lastMessage) : null,
    lastReadMessageRecordId: conversation.lastReadMessageId,
    lastActivityAt: conversation.lastActivityAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  })
}
