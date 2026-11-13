const videoIdPattern = /^[A-Za-z0-9_-]{11}$/
const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
])

export function youtubeVideoId(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    return null

  let id: string | null = null
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null
  } else if (youtubeHosts.has(url.hostname)) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (/^\/(?:shorts|embed|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null)
  }
  return id && videoIdPattern.test(id) ? id : null
}

export function youtubeVideosInText(text: string): string[] {
  const ids = new Set<string>()
  function collect(parts: WhatsAppTextPart[]) {
    for (const part of parts) {
      if (part.kind === 'link') {
        const id = youtubeVideoId(part.href)
        if (id) ids.add(id)
      } else if ('children' in part) collect(part.children)
    }
  }
  collect(parseWhatsAppText(text))
  return [...ids]
}

import { parseWhatsAppText, type WhatsAppTextPart } from '@shared/whatsapp-format'
