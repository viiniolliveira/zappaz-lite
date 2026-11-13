import type { WAUrlInfo } from 'baileys'
import { getPreviewFromContent } from 'link-preview-js'
import axios from './axios-instance.ts'
import { logger } from './logger.ts'

/** Parse only content fetched by our protected transport; never fetch preview images. */
export async function outboundLinkPreview(text: string): Promise<WAUrlInfo | undefined> {
  try {
    const response = await axios.get<string>(text, {
      maxContentLength: 1024 * 1024,
      responseType: 'text',
    })
    const preview = await getPreviewFromContent({
      url: text,
      data: response.data,
      headers: { 'content-type': String(response.headers['content-type'] ?? '') },
    })
    if (!('title' in preview)) return undefined
    return {
      'canonical-url': text,
      'matched-text': text,
      title: preview.title.slice(0, 512),
      description: preview.description?.slice(0, 2048),
    }
  } catch {
    logger.debug('Link preview unavailable or destination refused')
    return undefined
  }
}
