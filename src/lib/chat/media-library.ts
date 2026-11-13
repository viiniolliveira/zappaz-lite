import type { MediaDTO } from './schemas'
import type { ChatMessage } from './types'

export type ChatMediaMessage = ChatMessage & { media: NonNullable<ChatMessage['media']> }
export type OpenChatMedia = (messageId: string, blob: Blob | null) => void

export function documentType(media: MediaDTO) {
  if (media.mimeType?.split(';')[0] === 'application/pdf') return 'PDF'
  const extension = media.fileName?.split('.').at(-1)
  if (media.fileName?.includes('.') && extension && /^[a-z0-9]{1,8}$/i.test(extension))
    return extension.toUpperCase()
  return 'Documento'
}

export function documentSize(size: number | null) {
  if (size === null) return null
  if (size < 1000) return `${size} B`
  const unit = size < 1_000_000 ? 'kB' : 'MB'
  const value = size / (unit === 'kB' ? 1000 : 1_000_000)
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)} ${unit}`
}

export function isPdfMedia(media: MediaDTO) {
  if (media.kind !== 'document') return false
  const mime = media.mimeType?.split(';')[0].trim().toLowerCase()
  return (
    mime === 'application/pdf' ||
    ((!mime || mime === 'application/octet-stream') && /\.pdf$/i.test(media.fileName ?? ''))
  )
}

export function getChatMediaMessages(
  messages: ChatMessage[],
  sessionId: string,
  conversationId: string,
): ChatMediaMessage[] {
  return messages.filter(
    (message): message is ChatMediaMessage =>
      message.sessionId === sessionId &&
      message.conversationId === conversationId &&
      !message.deletedAt &&
      (message.type === 'image' ||
        message.type === 'video' ||
        message.type === 'audio' ||
        message.type === 'document') &&
      message.media?.kind === message.type,
  )
}

export function mediaThumbnail(message: ChatMediaMessage): string | undefined {
  const thumbnail = message.media.thumbnail
  return thumbnail ? `data:${thumbnail.mimeType};base64,${thumbnail.base64}` : undefined
}
