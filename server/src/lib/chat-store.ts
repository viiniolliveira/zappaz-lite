import { prisma } from '@db/prisma'
import type { Prisma } from '@generated/prisma'
import { hasWhatsAppLink } from '@shared/whatsapp-format.ts'
import {
  type Contact,
  isJidStatusBroadcast,
  jidNormalizedUser,
  normalizeMessageContent,
  type WAProto,
} from 'baileys'
import { AppError } from '../common/errors/app-error.ts'
import { PollSchema } from './chat-contract.ts'
import { type ChatChange, publishChatChange } from './chat-events.ts'
import {
  contactJids,
  conversationIdentityWhere,
  ensureChatContact as ensureContact,
  isContactIdentityConflict,
  messageContactIdentifiers,
} from './chat-identity.ts'
import { extractChatLinkPreview } from './chat-link-preview.ts'
import {
  extractChatThumbnail,
  extractMessageThumbnail,
  extractReplyThumbnail,
} from './chat-thumbnail.ts'
import {
  isIgnoredChatMessage,
  normalizeWhatsappMessage,
  revokedMessageKey,
} from './whatsapp-event-normalizer.ts'
import { interactiveContent } from './whatsapp-interactive.ts'
import { applyPollVotes, normalizePollVotes } from './whatsapp-poll.ts'

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  // Baileys protobuf objects include Long/Buffer; serialize before passing to pg.
  return JSON.parse(JSON.stringify(value))
}

/** Serialize ingestion and read cursors across processes, not just this instance. */
export async function chatTransaction<T>(
  sessionId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`
    return action(tx)
  })
}

export function privateJid(jid: string) {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
}
function nonnegativeMetadata(value: unknown) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null
}
function mediaDimension(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2147483647
    ? value
    : null
}

export interface ChatBatchResult {
  processed: number
  conflicts: number
}

export async function storeContacts(
  sessionId: string,
  contacts: Partial<Contact>[],
): Promise<ChatBatchResult> {
  const result: ChatBatchResult = { processed: 0, conflicts: 0 }
  for (const contact of contacts) {
    if (!contact.id) continue
    const jid = jidNormalizedUser(contact.id)
    if (!privateJid(jid)) continue
    const ensured = await chatTransaction(sessionId, (tx) =>
      ensureContact(
        tx,
        sessionId,
        jid,
        {
          ...(contact.name !== undefined ? { name: contact.name } : {}),
          ...(contact.notify !== undefined ? { pushName: contact.notify } : {}),
          ...(contact.imgUrl !== undefined && contact.imgUrl !== 'changed'
            ? {
                avatarUrl: contact.imgUrl === 'removed' ? null : contact.imgUrl,
              }
            : {}),
        },
        [contact.lid, contact.phoneNumber],
      ),
    ).catch((error: unknown) => {
      if (!isContactIdentityConflict(error)) throw error
      result.conflicts++
      return null
    })
    if (!ensured) continue
    const saved = ensured.contact
    publishChatChange({ sessionId, contactId: saved.id })
    const conversations = await chatTransaction(sessionId, async (tx) => {
      await tx.waConversation.updateMany({
        where: { sessionId, contactId: saved.id },
        data: { revision: { increment: 1 } },
      })
      return tx.waConversation.findMany({
        where: { sessionId, contactId: saved.id, isGroup: false },
        select: { id: true },
      })
    })
    for (const conversation of conversations)
      publishChatChange({ sessionId, conversationId: conversation.id })
    result.processed++
  }
  return result
}

export async function storeChatSummaries(
  sessionId: string,
  chats: Array<{ id?: string | null; name?: string | null }>,
): Promise<ChatBatchResult> {
  const result: ChatBatchResult = { processed: 0, conflicts: 0 }
  for (const chat of chats) {
    if (!chat.id) continue
    const jid = jidNormalizedUser(chat.id)
    if (!privateJid(jid)) continue
    const conversation = await chatTransaction(sessionId, async (tx) => {
      const { contact } = await ensureContact(
        tx,
        sessionId,
        jid,
        chat.name ? { name: chat.name } : {},
      )
      const canonicalJid = contact.jid
      const deleted = await tx.waConversationDeletion.findFirst({
        where: { sessionId, jid: { in: contactJids(contact) } },
      })
      if (deleted) {
        const existing = await tx.waConversation.findUnique({
          where: { sessionId_jid: { sessionId, jid: canonicalJid } },
        })
        if (!existing) return null
      }
      return tx.waConversation.upsert({
        where: { sessionId_jid: { sessionId, jid: canonicalJid } },
        update: { contactId: contact.id, revision: { increment: 1 } },
        create: { sessionId, jid: canonicalJid, contactId: contact.id },
      })
    }).catch((error: unknown) => {
      if (!isContactIdentityConflict(error)) throw error
      result.conflicts++
      return null
    })
    if (!conversation) continue
    publishChatChange({
      sessionId,
      conversationId: conversation.id,
      contactId: conversation.contactId ?? undefined,
    })
    result.processed++
  }
  return result
}

export async function storeChatMessage(
  sessionId: string,
  message: WAProto.IWebMessageInfo,
  source: ChatChange['source'] = 'live',
  ownJid?: string | null,
  clientRequestId?: string,
) {
  if (!(message.key?.id && message.key.remoteJid)) return null
  if (isIgnoredChatMessage(message)) return null
  const revoked = revokedMessageKey(message)
  if (revoked) {
    await updateChatMessage(sessionId, revoked, { deleted: true })
    return null
  }
  if (isJidStatusBroadcast(message.key.remoteJid)) return null
  const jid = jidNormalizedUser(message.key.remoteJid)
  const content = interactiveContent(message.message)
  if (content?.protocolMessage) {
    const protocol = content.protocolMessage
    // Protocol envelopes are control events, not conversation messages.
    if (!protocol.key?.id) return null
    const key = {
      ...protocol.key,
      remoteJid: protocol.key?.remoteJid ?? message.key.remoteJid,
    }
    if (protocol.type === 0) await updateChatMessage(sessionId, key, { deleted: true })
    if (protocol.type === 14 && protocol.editedMessage)
      await updateChatMessage(sessionId, key, {
        message: protocol.editedMessage,
      })
    return null
  }
  const normalized = normalizeWhatsappMessage(sessionId, message, ownJid)
  if (normalized.groupInvite)
    normalized.groupInvite.thumbnail =
      (await extractMessageThumbnail({
        imageMessage: normalizeMessageContent(message.message)?.groupInviteMessage,
      })) ?? null
  const linkPreview = await extractChatLinkPreview(message.message)
  const locationThumbnail = normalized.location ? await extractMessageThumbnail(content) : null
  if (content?.reactionMessage?.key?.id) {
    await storeChatReaction(
      sessionId,
      { ...content.reactionMessage.key, remoteJid: message.key.remoteJid },
      {
        senderJid: normalized.sender.id ?? jid,
        fromMe: normalized.fromMe,
        emoji: content.reactionMessage.text ?? '',
        timestamp: normalized.timestamp,
      },
    )
    return null
  }
  const media =
    content?.imageMessage ??
    content?.videoMessage ??
    content?.audioMessage ??
    content?.documentMessage ??
    content?.stickerMessage
  const thumbnail = await extractChatThumbnail(
    media && 'jpegThumbnail' in media ? media.jpegThumbnail : null,
  )
  const replyThumbnail = normalized.replyTo
    ? await extractReplyThumbnail(normalizeMessageContent(message.message))
    : null
  const replySender = normalized.replyTo?.senderId
    ? jidNormalizedUser(normalized.replyTo.senderId)
    : null
  const replyFromMe =
    replySender && ownJid && replySender === jidNormalizedUser(ownJid)
      ? true
      : replySender &&
          messageContactIdentifiers(message.key).some(
            (value) => value && jidNormalizedUser(value) === replySender,
          )
        ? false
        : null
  const result = await chatTransaction(sessionId, async (tx) => {
    const ensuredContact = privateJid(jid)
      ? await ensureContact(
          tx,
          sessionId,
          jid,
          !message.key?.fromMe && message.pushName ? { pushName: message.pushName } : {},
          messageContactIdentifiers(message.key ?? {}),
        )
      : null
    const contact = ensuredContact?.contact ?? null
    const canonicalJid = contact?.jid ?? jid
    if (source === 'history') {
      const deletion = await tx.waConversationDeletion.findFirst({
        where: {
          sessionId,
          jid: { in: contact ? contactJids(contact) : [jid] },
        },
        orderBy: { deletedAt: 'desc' },
      })
      if (deletion) {
        const existing = await tx.waConversation.findUnique({
          where: { sessionId_jid: { sessionId, jid: canonicalJid } },
        })
        if (
          !(existing && normalized.timestamp) ||
          new Date(normalized.timestamp) <= deletion.historyBefore
        )
          return null
      }
    }
    const conversation = await tx.waConversation.upsert({
      where: { sessionId_jid: { sessionId, jid: canonicalJid } },
      update: contact ? { contactId: contact.id } : {},
      create: {
        sessionId,
        jid: canonicalJid,
        isGroup: !privateJid(jid),
        contactId: contact?.id,
      },
    })
    const messageId = message.key?.id as string
    const existing = await tx.waMessage.findUnique({
      where: {
        sessionId_conversationId_messageId: {
          sessionId,
          conversationId: conversation.id,
          messageId,
        },
      },
    })
    if (existing) {
      if (clientRequestId && existing.clientRequestId !== clientRequestId) {
        const updated = await tx.waMessage.update({
          where: { id: existing.id },
          data: { clientRequestId, revision: { increment: 1 } },
        })
        await tx.waConversation.update({
          where: { id: conversation.id },
          data: { revision: { increment: 1 } },
        })
        return { message: updated, conversation, changed: true }
      }
      return {
        message: existing,
        conversation,
        changed: false,
        contactChanged: ensuredContact?.changed ?? false,
      }
    }
    const sentAt = normalized.timestamp ? new Date(normalized.timestamp) : null
    const saved = await tx.waMessage.create({
      data: {
        sessionId,
        conversationId: conversation.id,
        messageId,
        fromMe: normalized.fromMe,
        senderJid: normalized.sender.id,
        senderName: normalized.sender.name,
        type: normalized.type === 'reaction' ? 'unknown' : normalized.type,
        text: normalized.text,
        hasLink: !!linkPreview || hasWhatsAppLink(normalized.text),
        status: message.status,
        sentAt,
        orderAt: sentAt ?? new Date(),
        rawContent: jsonValue(message),
        content: jsonValue({
          ...normalized,
          ...(normalized.reactions
            ? {
                reactionVersions: Object.fromEntries(
                  normalized.reactions.map((reaction) => [reaction.senderJid, reaction.timestamp]),
                ),
              }
            : {}),
          linkPreview,
          location: normalized.location
            ? { ...normalized.location, thumbnail: locationThumbnail }
            : null,
          ...(normalized.replyTo
            ? {
                replyTo: {
                  ...normalized.replyTo,
                  fromMe: replyFromMe,
                  ...(normalized.replyTo.media
                    ? {
                        media: {
                          ...normalized.replyTo.media,
                          thumbnail: replyThumbnail,
                        },
                      }
                    : {}),
                },
              }
            : {}),
          liveReceived: source === 'live' && !normalized.fromMe,
        }),
        clientRequestId,
      },
    })
    if (media && normalized.media) {
      await tx.waMessageMedia.create({
        data: {
          sessionId,
          conversationId: conversation.id,
          messageId: saved.id,
          kind: saved.type,
          mimeType: normalized.media.mimeType,
          fileName: normalized.media.fileName,
          size: nonnegativeMetadata(normalized.media.size),
          duration: nonnegativeMetadata(normalized.media.duration),
          voice: normalized.media.voice,
          width: mediaDimension('width' in media ? media.width : null),
          height: mediaDimension('height' in media ? media.height : null),
          ...thumbnail,
        },
      })
    }
    const newer =
      !conversation.lastActivityAt ||
      saved.orderAt > conversation.lastActivityAt ||
      (saved.orderAt.getTime() === conversation.lastActivityAt.getTime() &&
        saved.id > (conversation.lastMessageId ?? ''))
    await tx.waConversation.update({
      where: { id: conversation.id },
      data: {
        ...(newer ? { lastMessageId: saved.id, lastActivityAt: saved.orderAt } : {}),
        ...(source === 'live' && !saved.fromMe && !conversation.isGroup
          ? { unreadCount: { increment: 1 } }
          : {}),
        revision: { increment: 1 },
      },
    })
    return { message: saved, conversation, changed: true }
  })
  if (!result) return null
  if (result.changed && !result.conversation.isGroup)
    publishChatChange({
      sessionId,
      conversationId: result.conversation.id,
      contactId: result.conversation.contactId ?? undefined,
      messageId: result.message.id,
      source,
    })
  else if (result.contactChanged && result.conversation.contactId)
    publishChatChange({
      sessionId,
      conversationId: result.conversation.id,
      contactId: result.conversation.contactId,
    })
  return result.message
}

export async function findLegacyMessage(sessionId: string, messageId: string, jid?: string | null) {
  const matches = await prisma.waMessage.findMany({
    where: {
      sessionId,
      messageId,
      ...(jid ? { conversation: conversationIdentityWhere(jid) } : {}),
    },
    take: 2,
  })
  if (matches.length > 1)
    throw new AppError({
      status: 409,
      code: 'AMBIGUOUS_MESSAGE_ID',
      message: 'AMBIGUOUS_MESSAGE_ID: specify the conversation',
    })
  return matches[0] ?? null
}

export async function updateChatMessage(
  sessionId: string,
  key: WAProto.IMessageKey,
  update: {
    status?: number | null
    deleted?: boolean
    message?: WAProto.IMessage | null
    pollUpdates?: WAProto.IPollUpdate[] | null
    finalLiveLocation?: WAProto.IWebMessageInfo['finalLiveLocation']
  },
  ownJid?: string | null,
) {
  if (!(key.id && key.remoteJid)) return
  const result = await chatTransaction(sessionId, async (tx) => {
    const saved = await tx.waMessage.findFirst({
      where: {
        sessionId,
        messageId: key.id as string,
        conversation: conversationIdentityWhere(key.remoteJid as string),
      },
    })
    if (!saved) return null
    const previousContent =
      saved.content && typeof saved.content === 'object' && !Array.isArray(saved.content)
        ? saved.content
        : {}
    const status =
      update.status == null
        ? saved.status
        : saved.status == null
          ? update.status
          : Math.max(saved.status, update.status)
    const edited = update.message
      ? normalizeWhatsappMessage(sessionId, { key, message: update.message }, null)
      : null
    const deleted = update.deleted || update.message === null
    const linkPreview = edited ? await extractChatLinkPreview(update.message) : null
    const poll =
      update.pollUpdates && previousContent.poll && !saved.deletedAt
        ? applyPollVotes(
            PollSchema.parse(previousContent.poll),
            normalizePollVotes(update.pollUpdates, ownJid),
          )
        : null
    const finalLocation =
      update.finalLiveLocation && !saved.deletedAt
        ? normalizeWhatsappMessage(sessionId, { key, finalLiveLocation: update.finalLiveLocation })
            .location
        : null
    if (status === saved.status && !edited && !deleted && !poll && !finalLocation) return null
    await tx.waMessage.update({
      where: { id: saved.id },
      data: {
        status,
        ...(!deleted && !edited && (poll || finalLocation)
          ? {
              ...(finalLocation
                ? { type: 'location', text: 'Localização em tempo real encerrada', hasLink: false }
                : {}),
              content: jsonValue({
                ...previousContent,
                ...(poll ? { poll } : {}),
                ...(finalLocation
                  ? { type: 'location', location: { ...finalLocation, thumbnail: null } }
                  : {}),
              }),
            }
          : {}),
        ...(deleted
          ? {
              deletedAt: new Date(),
              text: null,
              hasLink: false,
              content: {},
              rawContent: jsonValue({ key }),
            }
          : {}),
        ...(edited && !deleted && !saved.deletedAt
          ? {
              text: edited.text ?? null,
              hasLink: !!linkPreview || hasWhatsAppLink(edited.text),
              content: jsonValue({
                ...edited,
                replyTo: edited.replyTo ?? previousContent.replyTo ?? null,
                location: edited.location
                  ? {
                      ...edited.location,
                      thumbnail: await extractMessageThumbnail(
                        normalizeMessageContent(update.message),
                      ),
                    }
                  : null,
                linkPreview,
                reactions: previousContent.reactions ?? [],
                reactionVersions: previousContent.reactionVersions ?? {},
                liveReceived: previousContent.liveReceived ?? false,
              }),
              editedAt: new Date(),
              rawContent: {
                key: jsonValue(key),
                message: jsonValue(update.message),
              },
            }
          : {}),
        revision: { increment: 1 },
      },
    })
    await tx.waConversation.update({
      where: { id: saved.conversationId },
      data: { revision: { increment: 1 } },
    })
    return saved
  })
  if (result)
    publishChatChange({
      sessionId,
      conversationId: result.conversationId,
      messageId: result.id,
      source: 'update',
    })
}

export async function storeChatReaction(
  sessionId: string,
  key: WAProto.IMessageKey,
  reaction: {
    senderJid: string
    fromMe: boolean
    emoji: string
    timestamp: string | null
  },
) {
  if (!(key.id && key.remoteJid)) return
  const saved = await chatTransaction(sessionId, async (tx) => {
    const message = await tx.waMessage.findFirst({
      where: {
        sessionId,
        messageId: key.id as string,
        conversation: conversationIdentityWhere(key.remoteJid as string),
      },
    })
    if (!message || message.deletedAt) return null
    const content =
      message.content && typeof message.content === 'object' && !Array.isArray(message.content)
        ? message.content
        : {}
    const old = Array.isArray(content.reactions) ? content.reactions : []
    const versions =
      content.reactionVersions &&
      typeof content.reactionVersions === 'object' &&
      !Array.isArray(content.reactionVersions)
        ? content.reactionVersions
        : {}
    const previousVersion = versions[reaction.senderJid]
    if (
      typeof previousVersion === 'string' &&
      reaction.timestamp &&
      reaction.timestamp <= previousVersion
    )
      return null
    const reactions = old.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        item.senderJid !== reaction.senderJid,
    )
    if (reaction.emoji) reactions.push(reaction)
    await tx.waMessage.update({
      where: { id: message.id },
      data: {
        content: jsonValue({
          ...content,
          reactions,
          reactionVersions: {
            ...versions,
            [reaction.senderJid]: reaction.timestamp,
          },
        }),
        revision: { increment: 1 },
      },
    })
    await tx.waConversation.update({
      where: { id: message.conversationId },
      data: { revision: { increment: 1 } },
    })
    return message
  })
  if (saved)
    publishChatChange({
      sessionId,
      conversationId: saved.conversationId,
      messageId: saved.id,
      source: 'update',
    })
}

export async function deleteChatMessages(sessionId: string, jid: string) {
  const result = await chatTransaction(sessionId, async (tx) => {
    const conversation = await tx.waConversation.findFirst({
      where: { sessionId, ...conversationIdentityWhere(jid) },
    })
    if (!conversation) return null
    const messages = await tx.waMessage.findMany({
      where: { sessionId, conversationId: conversation.id, deletedAt: null },
      select: { id: true },
    })
    await tx.waMessage.updateMany({
      where: { sessionId, conversationId: conversation.id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        text: null,
        rawContent: {},
        content: {},
        revision: { increment: 1 },
      },
    })
    await tx.waConversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0, revision: { increment: 1 } },
    })
    return { conversation, messages }
  })
  if (!result || result.conversation.isGroup) return
  for (const message of result.messages)
    publishChatChange({
      sessionId,
      conversationId: result.conversation.id,
      messageId: message.id,
      source: 'update',
    })
}
