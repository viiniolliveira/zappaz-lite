import { Image } from 'bun'
import { acquireMediaProcessing } from './resource-limit.ts'

const MAX_THUMBNAIL_BASE64_BYTES = 4 * 1024
const THUMBNAIL_ENCODINGS = [
  { size: 64, quality: 50 },
  { size: 64, quality: 30 },
  { size: 48, quality: 30 },
  { size: 32, quality: 20 },
  { size: 16, quality: 15 },
] as const

/** Generate a compact JPEG preview using Bun's native, off-thread image pipeline. */
export async function generateThumb(bytes: Uint8Array) {
  const release = acquireMediaProcessing()
  try {
    return await encodeThumbnail(bytes)
  } finally {
    release()
  }
}

async function encodeThumbnail(bytes: Uint8Array) {
  for (const { size, quality } of THUMBNAIL_ENCODINGS) {
    const image = new Image(bytes, {
      maxPixels: 40_000_000,
      autoOrient: true,
    })
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
    const thumbnailBase64 = await image.toBase64()
    // Base64 is ASCII: its string length is also its encoded byte size.
    if (thumbnailBase64.length <= MAX_THUMBNAIL_BASE64_BYTES) {
      return {
        thumbnailBase64,
        thumbnailMimeType: 'image/jpeg',
        thumbnailWidth: image.width,
        thumbnailHeight: image.height,
      }
    }
  }
  throw new Error('Generated thumbnail exceeds the 4 KB base64 limit')
}
