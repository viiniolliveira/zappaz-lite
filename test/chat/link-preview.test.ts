import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageText from '../../src/components/chat/messages/message-text'
import MessageLinkPreview from '../../src/components/chat/messages/message-link-preview'
import { linkPreviewSchema } from '../../src/lib/chat/schemas.ts'
import { extractChatLinkPreview } from '../../server/src/lib/chat-link-preview.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'
import MessageBubble from '../../src/components/chat/message-bubble'
import { mockMessage } from './mock-data.ts'

const url = 'https://example.com/article'
const preview = { url, title: 'Título do artigo', description: 'Descrição do conteúdo', thumbnail: null }

async function messageTextContent(html: string) {
  let text = ''
  const links: { href: string | null; target: string | null; rel: string | null }[] = []
  const rewriter = new HTMLRewriter()
    .on('p.whitespace-pre-wrap', { text(chunk) { text += chunk.text } })
    .on('p.whitespace-pre-wrap a', { element(element) {
      links.push({ href: element.getAttribute('href'), target: element.getAttribute('target'), rel: element.getAttribute('rel') })
    } })
  await rewriter.transform(new Response(html)).text()
  return { text, links }
}

describe('WhatsApp link previews', () => {
  test('extracts metadata and validates the attached JPEG without fetching the website', async () => {
    const result = await extractChatLinkPreview({ extendedTextMessage: {
      text: `Confira ${url}`, matchedText: url, title: ' Título do artigo ', description: preview.description,
      jpegThumbnail: Buffer.from(mockThumbnailBase64, 'base64'),
    } })
    expect(result).toMatchObject({ ...preview, thumbnail: { base64: mockThumbnailBase64, mimeType: 'image/jpeg' } })
    expect(linkPreviewSchema.safeParse(result).success).toBe(true)
  })

  test('unwraps messages and keeps textual metadata when thumbnail is invalid', async () => {
    expect(await extractChatLinkPreview({ ephemeralMessage: { message: { extendedTextMessage: {
      text: url, matchedText: url, title: preview.title, description: preview.description, jpegThumbnail: new Uint8Array([1, 2]),
    } } } })).toEqual(preview)
  })

  test('ignores absent metadata, unrelated URLs and unsafe destinations', async () => {
    expect(await extractChatLinkPreview({ conversation: url })).toBeNull()
    expect(await extractChatLinkPreview({ extendedTextMessage: { text: url, matchedText: url } })).toBeNull()
    for (const matchedText of ['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.com', 'invalid', 'https://other.example']) {
      expect(await extractChatLinkPreview({ extendedTextMessage: { text: url, matchedText, title: 'Unsafe' } })).toBeNull()
      expect(await extractChatLinkPreview({ extendedTextMessage: { text: matchedText, matchedText, title: 'Unsafe' } })).toEqual(matchedText === 'https://other.example' ? { url: `${matchedText}/`, title: 'Unsafe', description: null, thumbnail: null } : null)
    }
  })

  test('bounds external text and allows image-only previews', async () => {
    const result = await extractChatLinkPreview({ extendedTextMessage: { text: url, matchedText: url, title: 't'.repeat(600), description: 'd'.repeat(3000) } })
    expect(result?.title).toHaveLength(512)
    expect(result?.description).toHaveLength(2048)
    const imageOnly = await extractChatLinkPreview({ extendedTextMessage: { text: url, matchedText: url, jpegThumbnail: Buffer.from(mockThumbnailBase64, 'base64') } })
    expect(imageOnly?.thumbnail).not.toBeNull()
  })

  test('renders an accessible card and preserves the full original text', async () => {
    const text = `Confira este artigo: ${url}`
    const html = renderToStaticMarkup(createElement(MessageText, { text, linkPreview: preview }))
    expect(html).toContain('data-slot="message-link-preview"')
    expect(html).toContain('Abrir link: Título do artigo')
    expect(html).toContain('noopener noreferrer')
    expect(html).toContain('example.com')
    expect(await messageTextContent(html)).toEqual({ text, links: [{ href: url, target: '_blank', rel: 'noopener noreferrer' }] })
    expect(html).not.toContain('<img')
    expect(renderToStaticMarkup(createElement(MessageText, { text }))).not.toContain('message-link-preview')
  })

  test('preserves the full long message alongside its preview', async () => {
    const text = `${'Uma mensagem longa com várias palavras. '.repeat(30)}${url}`
    const html = renderToStaticMarkup(createElement(MessageText, { text, linkPreview: preview }))
    expect(html).toContain('data-slot="message-link-preview"')
    expect(await messageTextContent(html)).toEqual({ text, links: [{ href: url, target: '_blank', rel: 'noopener noreferrer' }] })
  })

  test('rejects unsafe URLs and escapes titles instead of rendering HTML', () => {
    expect(renderToStaticMarkup(createElement(MessageLinkPreview, { preview: { ...preview, url: 'javascript:alert(1)' } }))).toBe('')
    const html = renderToStaticMarkup(createElement(MessageLinkPreview, { preview: { ...preview, title: '<script>test</script>' } }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('renders the large cover, domain icon and compact message footer', () => {
    const message = mockMessage(1, '00000000-0000-4000-8000-000000000002', {
      text: url,
      linkPreview: { ...preview, thumbnail: { mimeType: 'image/jpeg', base64: mockThumbnailBase64, width: 80, height: 60 } },
    })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('aspect-[8/5]')
    expect(html).toContain('lucide-link')
    expect(html).toContain('font-semibold')
    expect(html).toContain('px-2 pb-1')
    expect(html).not.toContain('px-3.5 py-2.5')
  })

  test('keeps the YouTube player without duplicating the generic card', () => {
    const html = renderToStaticMarkup(createElement(MessageText, { text: 'https://youtu.be/dQw4w9WgXcQ', linkPreview: { ...preview, url: 'https://youtu.be/dQw4w9WgXcQ' } }))
    expect(html).not.toContain('data-slot="message-link-preview"')
    expect(html).toContain('dQw4w9WgXcQ')
  })
})
