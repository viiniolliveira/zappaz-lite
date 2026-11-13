import { normalizeMessageContent, type WAProto } from 'baileys'
import sharp from 'sharp'
import { z } from 'zod'
import { acquireMediaProcessing } from './resource-limit.ts'
import { interactiveContent, messageContext } from './whatsapp-interactive.ts'

const SerializedBufferSchema = z.object({
  type: z.literal('Buffer'),
  data: z.array(z.number().int().min(0).max(255)).max(262144),
})

export async function extractReplyThumbnail(content: WAProto.IMessage | null | undefined) {
  const quoted = normalizeMessageContent(content ? messageContext(content)?.quotedMessage : null)
  return extractMessageThumbnail(interactiveContent(quoted))
}

export async function extractMessageThumbnail(content: WAProto.IMessage | null | undefined) {
  const media =
    content?.imageMessage ??
    content?.videoMessage ??
    content?.documentMessage ??
    content?.stickerMessage ??
    content?.locationMessage ??
    content?.liveLocationMessage
  const thumbnail = await extractChatThumbnail(
    media && 'jpegThumbnail' in media ? media.jpegThumbnail : null,
  )
  return thumbnail
    ? {
        mimeType: 'image/jpeg' as const,
        base64: thumbnail.thumbnailBase64,
        width: thumbnail.thumbnailWidth,
        height: thumbnail.thumbnailHeight,
      }
    : null
}

/** WhatsApp previews are untrusted bytes, independent from full-file storage. */
export async function extractChatThumbnail(value: unknown) {
  let bytes: Buffer
  if (value instanceof Uint8Array) {
    if (value.byteLength > 262144) return null
    bytes = Buffer.from(value)
  } else if (typeof value === 'string') {
    if (
      value.length > 349528 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    )
      return null
    bytes = Buffer.from(value, 'base64')
    if (bytes.byteLength > 262144) return null
  } else {
    const parsed = SerializedBufferSchema.safeParse(value)
    if (!parsed.success) return null
    bytes = Buffer.from(parsed.data.data)
  }
  if (!bytes.length) return null
  let release: (() => void) | undefined
  try {
    release = acquireMediaProcessing()
    const metadata = await sharp(bytes, {
      limitInputPixels: 16777216,
    }).metadata()
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height) return null
    // Decode as well: metadata alone accepts truncated/corrupt JPEGs.
    await sharp(bytes, { limitInputPixels: 16777216 }).stats()
    return {
      thumbnailBase64: bytes.toString('base64'),
      thumbnailMimeType: 'image/jpeg',
      thumbnailWidth: metadata.width,
      thumbnailHeight: metadata.height,
    }
  } catch {
    // Invalid previews must never prevent ingestion of the message itself.
    return null
  } finally {
    release?.()
  }
}
