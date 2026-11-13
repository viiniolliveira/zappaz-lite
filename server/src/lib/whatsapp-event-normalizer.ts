import {
  type BaileysEventMap,
  normalizeMessageContent,
  proto,
  type WAMessageKey,
  WAMessageStubType,
  type WAProto,
} from 'baileys'
import type { z } from 'zod'
import type {
  AlbumSchema,
  GroupInviteSchema,
  InteractiveMessage,
  SelectionSchema,
  SystemMessageSchema,
  UnavailableMessageSchema,
} from './chat-contract.ts'
import { contactIdentifiers, messageContactIdentifiers } from './chat-identity.ts'
import { extractMessageThumbnail, extractReplyThumbnail } from './chat-thumbnail.ts'
import { type NormalizedVcardContact, normalizeVcardContact } from './vcard.ts'
import {
  interactiveContent,
  messageContext,
  normalizeInteractiveMessage,
} from './whatsapp-interactive.ts'
import { applyPollVotes, normalizePoll, normalizePollVotes, type Poll } from './whatsapp-poll.ts'

export type MessageStatus = 'error' | 'pending' | 'sent' | 'delivered' | 'read' | 'played'

export function isIgnoredChatMessage(message: WAProto.IWebMessageInfo): boolean {
  return (
    message.messageStubType === WAMessageStubType.E2E_ENCRYPTED ||
    message.messageStubType === WAMessageStubType.E2E_ENCRYPTED_NOW ||
    message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_INIT_FB ||
    message.messageStubType === WAMessageStubType.BIZ_COEX_PRIVACY_INIT ||
    message.messageStubType === WAMessageStubType.CHAT_PSA ||
    message.messageStubType === WAMessageStubType.BIZ_COEX_PRIVACY_TRANSITION ||
    message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB ||
    message.messageStubType === WAMessageStubType.BIZ_BOT_1P_MESSAGING_ENABLED ||
    message.messageStubType === WAMessageStubType.BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE
  )
}

export function revokedMessageKey(message: WAProto.IWebMessageInfo): WAProto.IMessageKey | null {
  if (message.messageStubType !== WAMessageStubType.REVOKE) return null
  return {
    ...message.key,
    id: message.messageStubParameters?.[0] || message.key?.id,
  }
}

export interface MessageReference {
  id: string | null
  chatId: string | null
  remoteJid: string | null
  lid: string | null
  fromMe: boolean
}

export interface NormalizedMessageContent {
  interactive?: InteractiveMessage
  templateReply?: { selectedId: string | null; selectedIndex: number | null }
  selection?: z.infer<typeof SelectionSchema>
  poll?: Poll
  album?: z.infer<typeof AlbumSchema>
  groupInvite?: z.infer<typeof GroupInviteSchema>
  system?: z.infer<typeof SystemMessageSchema>
  unavailable?: z.infer<typeof UnavailableMessageSchema>
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'location'
    | 'contact'
    | 'reaction'
    | 'poll'
    | 'album'
    | 'group_invite'
    | 'system'
    | 'unavailable'
    | 'unknown'
  text?: string
  media?: {
    mimeType?: string
    fileName?: string
    size?: number
    duration?: number
    voice?: boolean
    downloadPath?: string
    thumbnail?: {
      mimeType: 'image/jpeg'
      base64: string
      width: number
      height: number
    }
  }
  location?: {
    latitude?: number
    longitude?: number
    name?: string
    address?: string
    url?: string
  }
  contacts?: NormalizedVcardContact[]
  reaction?: { messageId: string | null; emoji: string }
}

export interface NormalizedMessage extends MessageReference, NormalizedMessageContent {
  isGroup: boolean
  sender: { id: string | null; name?: string }
  timestamp: string | null
  status?: MessageStatus
  replyTo?: {
    id: string
    senderId?: string
  } & Partial<NormalizedMessageContent>
  mentions?: string[]
  reactions?: { senderJid: string; fromMe: boolean; emoji: string; timestamp: string | null }[]
  receipts?: ReturnType<typeof normalizeMessageReceipts>['receipts']
}

// Protobuf Long values must be converted, not cast: casts do not change JSON.
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  if (
    typeof value !== 'number' &&
    typeof value !== 'string' &&
    typeof value !== 'bigint' &&
    typeof value !== 'object'
  )
    return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function normalizeTimestamp(value: unknown): string | null {
  const seconds = toNumber(value)
  if (seconds === undefined) return null
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function normalizeMessageStatus(
  value: number | null | undefined,
): MessageStatus | undefined {
  const statuses: MessageStatus[] = ['error', 'pending', 'sent', 'delivered', 'read', 'played']
  return value == null ? undefined : statuses[value]
}

export function normalizeMessageReference(key?: WAMessageKey | null): MessageReference {
  const identifiers = contactIdentifiers(messageContactIdentifiers(key ?? {}))
  return {
    id: key?.id ?? null,
    chatId: key?.remoteJid ?? null,
    remoteJid: identifiers.phoneNumber ? `${identifiers.phoneNumber}@s.whatsapp.net` : null,
    lid: identifiers.lid ?? null,
    fromMe: key?.fromMe ?? false,
  }
}

export function normalizeMessageUpdates(
  updates: BaileysEventMap['messages.update'],
  ownJid?: string | null,
) {
  return {
    messages: updates.map(({ key, update }) => ({
      ...normalizeMessageReference(key),
      ...(normalizeMessageStatus(update.status) !== undefined
        ? { status: normalizeMessageStatus(update.status) }
        : {}),
      ...(update.pollUpdates ? { pollVotes: normalizePollVotes(update.pollUpdates, ownJid) } : {}),
      ...(update.finalLiveLocation
        ? {
            location: {
              latitude: update.finalLiveLocation.degreesLatitude ?? null,
              longitude: update.finalLiveLocation.degreesLongitude ?? null,
            },
          }
        : {}),
    })),
  }
}

export function normalizeMessageReactions(
  reactions: BaileysEventMap['messages.reaction'],
  ownJid?: string | null,
) {
  return {
    reactions: reactions.map(({ key, reaction }) => ({
      ...normalizeMessageReference(key),
      sender: {
        id: reaction.key?.fromMe
          ? (ownJid ?? null)
          : (reaction.key?.participant ?? reaction.key?.remoteJid ?? null),
        fromMe: reaction.key?.fromMe ?? false,
      },
      emoji: reaction.text ?? '',
      timestamp: normalizeTimestamp(
        toNumber(reaction.senderTimestampMs) === undefined
          ? undefined
          : Number(reaction.senderTimestampMs) / 1000,
      ),
    })),
  }
}

export function normalizeMessageReceipts(receipts: BaileysEventMap['message-receipt.update']) {
  const receiptTime = (value: unknown) =>
    (toNumber(value) ?? 0) > 0 ? normalizeTimestamp(value) : null
  return {
    receipts: receipts.map(({ key, receipt }) => ({
      ...normalizeMessageReference(key),
      recipientId: receipt.userJid ?? null,
      deliveredAt: receiptTime(receipt.receiptTimestamp),
      readAt: receiptTime(receipt.readTimestamp),
      playedAt: receiptTime(receipt.playedTimestamp),
    })),
  }
}

/** Public message contract, independent of webhook/socket and internal storage. */
export function normalizeWhatsappMessage(
  sessionId: string,
  message: WAProto.IWebMessageInfo,
  ownJid?: string | null,
): NormalizedMessage {
  const content = normalizeMessageContent(message.message) ?? {}
  const reference = normalizeMessageReference(message.key)
  const result: NormalizedMessage = {
    ...reference,
    isGroup: reference.chatId?.endsWith('@g.us') ?? false,
    sender: {
      id: message.key?.fromMe
        ? (ownJid ?? message.key.participant ?? null)
        : (message.key?.participant ?? reference.chatId),
      ...(message.pushName ? { name: message.pushName } : {}),
    },
    timestamp: normalizeTimestamp(message.messageTimestamp),
    ...normalizeMessageContentFields(sessionId, reference.id, content),
  }
  const status = normalizeMessageStatus(message.status)
  if (status !== undefined) result.status = status
  if (result.poll)
    result.poll = applyPollVotes(result.poll, normalizePollVotes(message.pollUpdates ?? [], ownJid))
  if (!message.message && !message.messageStubType && !message.finalLiveLocation) {
    result.type = 'unavailable'
    result.unavailable = { reason: 'missing_content' }
    result.text = 'Mensagem sem conteúdo disponível'
  }
  if (message.finalLiveLocation) {
    result.type = 'location'
    result.text = 'Localização em tempo real encerrada'
    result.location = {
      ...(message.finalLiveLocation.degreesLatitude != null
        ? { latitude: message.finalLiveLocation.degreesLatitude }
        : {}),
      ...(message.finalLiveLocation.degreesLongitude != null
        ? { longitude: message.finalLiveLocation.degreesLongitude }
        : {}),
    }
  }
  if (message.messageStubType === WAMessageStubType.DISAPPEARING_MODE) {
    const duration = toNumber(message.messageStubParameters?.[0])
    result.type = 'system'
    result.system = {
      kind: 'disappearing_mode',
      duration:
        duration !== undefined && Number.isInteger(duration) && duration >= 0 ? duration : null,
      blocked: null,
    }
    result.text =
      duration === 0
        ? 'Mensagens temporárias desativadas'
        : 'Configuração de mensagens temporárias alterada'
  } else if (message.messageStubType === WAMessageStubType.BLOCK_CONTACT) {
    const value = message.messageStubParameters?.[0]
    result.type = 'system'
    result.system = {
      kind: 'block_contact',
      duration: null,
      blocked: value === 'true' ? true : value === 'false' ? false : null,
    }
    result.text =
      value === 'true'
        ? 'Contato bloqueado'
        : value === 'false'
          ? 'Contato desbloqueado'
          : 'Configuração de bloqueio alterada'
  }
  if (message.reactions?.length) {
    result.reactions = normalizeMessageReactions(
      message.reactions.map((reaction) => ({ key: message.key ?? {}, reaction })),
      ownJid,
    ).reactions.flatMap((reaction) =>
      reaction.sender.id
        ? [
            {
              senderJid: reaction.sender.id,
              fromMe: reaction.sender.fromMe,
              emoji: reaction.emoji,
              timestamp: reaction.timestamp,
            },
          ]
        : [],
    )
  }
  if (message.userReceipt?.length)
    result.receipts = normalizeMessageReceipts(
      message.userReceipt.map((receipt) => ({ key: message.key ?? {}, receipt })),
    ).receipts
  const context = messageContext(content)
  if (context?.stanzaId) {
    result.replyTo = {
      id: context.stanzaId,
      ...(context.participant ? { senderId: context.participant } : {}),
      ...(context.quotedMessage
        ? normalizeMessageContentFields(
            sessionId,
            null,
            normalizeMessageContent(context.quotedMessage) ?? {},
          )
        : {}),
    }
  }
  if (context?.mentionedJid?.length) result.mentions = [...context.mentionedJid]

  return result
}

/** Webhook previews are validated locally; no media download or database lookup. */
export async function normalizeWhatsappMessageWithThumbnails(
  sessionId: string,
  message: WAProto.IWebMessageInfo,
  ownJid?: string | null,
): Promise<NormalizedMessage> {
  const result = normalizeWhatsappMessage(sessionId, message, ownJid)
  const content = normalizeMessageContent(message.message)
  if (result.media) {
    const thumbnail = await extractMessageThumbnail(interactiveContent(content))
    if (thumbnail) result.media.thumbnail = thumbnail
  }
  if (result.replyTo?.media) {
    const thumbnail = await extractReplyThumbnail(content)
    if (thumbnail) result.replyTo.media.thumbnail = thumbnail
  }
  if (result.groupInvite)
    result.groupInvite.thumbnail =
      (await extractMessageThumbnail({ imageMessage: content?.groupInviteMessage })) ?? null
  return result
}

// Extract content only: quotes cannot contain nested replies or raw contextInfo.
// A quoted message is not necessarily stored, so do not invent a download path.
function normalizeMessageContentFields(
  sessionId: string,
  messageId: string | null,
  content: WAProto.IMessage,
): NormalizedMessageContent {
  const interactive = normalizeInteractiveMessage(content)
  if (interactive) {
    const inner = normalizeMessageContentFields(sessionId, messageId, interactiveContent(content))
    return { ...inner, interactive: interactive.details, text: interactive.text ?? inner.text }
  }
  const result: NormalizedMessageContent = { type: 'unknown' }
  const poll = normalizePoll(content)
  const media =
    content.imageMessage ??
    content.videoMessage ??
    content.audioMessage ??
    content.documentMessage ??
    content.stickerMessage

  if (content.buttonsResponseMessage || content.listResponseMessage) {
    const button = content.buttonsResponseMessage
    const list = content.listResponseMessage
    result.type = 'text'
    result.text = button?.selectedDisplayText ?? list?.title ?? ''
    result.selection = {
      kind: button ? 'button' : 'list',
      id: button?.selectedButtonId ?? list?.singleSelectReply?.selectedRowId ?? null,
    }
  } else if (poll) {
    result.type = 'poll'
    result.text = poll.name
    result.poll = poll
  } else if (content.albumMessage) {
    result.type = 'album'
    result.album = {
      expectedImageCount: content.albumMessage.expectedImageCount ?? 0,
      expectedVideoCount: content.albumMessage.expectedVideoCount ?? 0,
    }
    result.text = 'Álbum de mídia'
  } else if (content.groupInviteMessage) {
    const invite = content.groupInviteMessage
    result.type = 'group_invite'
    result.text = invite.caption ?? 'Convite para grupo'
    result.groupInvite = {
      groupJid: invite.groupJid ?? null,
      name: invite.groupName ?? 'Grupo do WhatsApp',
      expiresAt: normalizeTimestamp(invite.inviteExpiration),
      url:
        invite.inviteCode && /^[A-Za-z0-9_-]+$/.test(invite.inviteCode)
          ? `https://chat.whatsapp.com/${invite.inviteCode}`
          : null,
      thumbnail: null,
    }
  } else if (
    content.placeholderMessage?.type ===
    proto.Message.PlaceholderMessage.PlaceholderType.MASK_LINKED_DEVICES
  ) {
    result.type = 'unavailable'
    result.unavailable = { reason: 'linked_device' }
    result.text = 'Mensagem indisponível neste dispositivo vinculado'
  } else if (content.templateButtonReplyMessage) {
    const reply = content.templateButtonReplyMessage
    result.type = 'text'
    result.text = reply.selectedDisplayText ?? ''
    result.templateReply = {
      selectedId: reply.selectedId ?? null,
      selectedIndex: Object.hasOwn(reply, 'selectedIndex') ? (reply.selectedIndex ?? null) : null,
    }
  } else if (content.conversation != null || content.extendedTextMessage) {
    result.type = 'text'
    result.text = content.conversation ?? content.extendedTextMessage?.text ?? ''
  } else if (media) {
    result.type = content.imageMessage
      ? 'image'
      : content.videoMessage
        ? 'video'
        : content.audioMessage
          ? 'audio'
          : content.documentMessage
            ? 'document'
            : 'sticker'
    result.media = {}
    if (media.mimetype) result.media.mimeType = media.mimetype
    const size = toNumber(media.fileLength)
    if (size !== undefined) result.media.size = size
    if ('fileName' in media && typeof media.fileName === 'string')
      result.media.fileName = media.fileName
    if ('seconds' in media && typeof media.seconds === 'number')
      result.media.duration = media.seconds
    if (content.audioMessage) result.media.voice = content.audioMessage.ptt ?? false
    if ('caption' in media && typeof media.caption === 'string') result.text = media.caption
    if (messageId) {
      result.media.downloadPath = `/api/v1/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}/media/base64`
    }
  } else if (content.locationMessage || content.liveLocationMessage) {
    const location = content.locationMessage ?? content.liveLocationMessage
    result.type = 'location'
    if (location) {
      result.location = {
        ...(Object.hasOwn(location, 'degreesLatitude') && location.degreesLatitude != null
          ? { latitude: location.degreesLatitude }
          : {}),
        ...(Object.hasOwn(location, 'degreesLongitude') && location.degreesLongitude != null
          ? { longitude: location.degreesLongitude }
          : {}),
        ...('name' in location && location.name ? { name: location.name } : {}),
        ...('address' in location && location.address ? { address: location.address } : {}),
        ...('url' in location && location.url ? { url: location.url } : {}),
      }
    }
  } else if (content.contactMessage || content.contactsArrayMessage) {
    result.type = 'contact'
    const contacts = content.contactMessage
      ? [content.contactMessage]
      : (content.contactsArrayMessage?.contacts ?? [])
    result.contacts = contacts.map(normalizeVcardContact)
  } else if (content.reactionMessage) {
    result.type = 'reaction'
    result.reaction = {
      messageId: content.reactionMessage.key?.id ?? null,
      emoji: content.reactionMessage.text ?? '',
    }
  }
  return result
}
