import {
  downloadMediaMessage,
  extractMessageContent,
  getContentType,
  getUrlFromDirectPath,
  type WAMessage,
} from 'baileys'
import { config } from '../config.ts'
import { InvalidMediaError } from '../services/errors.ts'
import { logger } from './logger.ts'
import { validateOutboundUrl } from './outbound-policy.ts'
import { acquireMediaProcessing } from './resource-limit.ts'

function validateMediaDestination(message: WAMessage): void {
  const content = extractMessageContent(message.message)
  const contentType = content && getContentType(content)
  const media = contentType && content?.[contentType]
  // Leave unsupported/missing media errors to the official downloader.
  if (!media || typeof media !== 'object') return
  const url = 'url' in media && typeof media.url === 'string' ? media.url : undefined
  const directPath =
    'thumbnailDirectPath' in media && !('url' in media)
      ? media.thumbnailDirectPath
      : 'directPath' in media
        ? media.directPath
        : undefined
  if (typeof directPath === 'string' && directPath) {
    let host: string | undefined
    if (url) {
      try {
        host = new URL(url).host
      } catch {
        // Baileys uses its default media host when the URL cannot be parsed.
      }
    }
    validateOutboundUrl(getUrlFromDirectPath(directPath, host))
  } else if (url) {
    validateOutboundUrl(url)
  }
}

/** Keep media recovery and decryption in Baileys, including its reupload flow. */
export async function downloadWhatsappMedia(
  message: WAMessage,
  reuploadRequest: (message: WAMessage) => Promise<WAMessage>,
): Promise<Buffer> {
  const release = acquireMediaProcessing()
  try {
    validateMediaDestination(message)
    const bytes = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: async (original) => {
          const updated = await reuploadRequest(original)
          validateMediaDestination(updated)
          return updated
        },
      },
    )
    if (bytes.length > config.mediaMaxFileSizeBytes)
      throw new InvalidMediaError(`Media exceeds ${config.mediaMaxFileSizeMb} MiB`)
    return bytes
  } finally {
    release()
  }
}
