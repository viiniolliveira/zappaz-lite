import { normalizeMessageContent, type WAProto } from 'baileys'
import { extractChatThumbnail } from './chat-thumbnail.ts'

/** Use only metadata attached by WhatsApp; never fetch the destination. */
export async function extractChatLinkPreview(message: WAProto.IMessage | null | undefined) {
  const text = normalizeMessageContent(message)?.extendedTextMessage
  const matched = text?.matchedText?.trim()
  if (!(matched && text?.text?.includes(matched))) return null
  let url: URL
  try {
    url = new URL(matched)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
  const title = text.title?.trim().slice(0, 512) || null
  const description = text.description?.trim().slice(0, 2048) || null
  const image = await extractChatThumbnail(text.jpegThumbnail)
  if (!(title || description || image)) return null
  return {
    url: url.href,
    title,
    description,
    thumbnail: image
      ? {
          mimeType: 'image/jpeg' as const,
          base64: image.thumbnailBase64,
          width: image.thumbnailWidth,
          height: image.thumbnailHeight,
        }
      : null,
  }
}
