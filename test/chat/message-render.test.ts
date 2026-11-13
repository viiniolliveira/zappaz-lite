import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import MessageAudio from '../../src/components/chat/messages/message-audio.tsx'
import MessageReply from '../../src/components/chat/messages/message-reply.tsx'
import { mockConversations, mockMessage } from './mock-data.ts'
import { sentVideoThumbnail } from '../media/sent-video-thumbnail.ts'

const conversationId = '22222222-2222-4222-8222-222222222222'
const timestamp = '2026-10-31T12:00:00.000Z'

describe('media replies', () => {
  test.each(['image', 'video'] as const)('renders an external %s quote with author, label and thumbnail', type => {
    const reply = { messageRecordId: null, messageId: 'outside', senderJid: null, fromMe: true, type, text: null, contacts: [], media: { mimeType: null, fileName: null, thumbnail: { mimeType: 'image/jpeg' as const, base64: 'cHJldmlldw==', width: 1, height: 1 } } }
    const html = renderToStaticMarkup(createElement(MessageReply, { reply }))
    expect(html).toContain('Você')
    expect(html).toContain(type === 'image' ? 'Foto' : 'Vídeo')
    expect(html).toContain('data:image/jpeg;base64,cHJldmlldw==')
    expect(html).toContain('object-cover')
    expect(html).not.toContain('<video')
  })

  test('uses the loaded original for old quotes and does not expose a deleted preview', () => {
    const original = mockConversations[0].messages.find(message => message.type === 'image')!
    const reply = { messageRecordId: null, messageId: original.messageId, senderJid: null, type: 'image' as const, text: null, contacts: [], media: null }
    const html = renderToStaticMarkup(createElement(MessageReply, { reply, quotedMessage: { ...original, fromMe: true } }))
    expect(html).toContain('Você')
    expect(html).toContain('data:image/jpeg;base64,')
    const deleted = renderToStaticMarkup(createElement(MessageReply, { reply, quotedMessage: { ...original, deletedAt: timestamp } }))
    expect(deleted).toContain('Mensagem removida')
    expect(deleted).not.toContain('<img')
  })

  test('keeps a readable video quote when there is no thumbnail', () => {
    const html = renderToStaticMarkup(createElement(MessageReply, { reply: { messageRecordId: null, messageId: 'outside', senderJid: null, fromMe: false, type: 'video', text: null, contacts: [], media: null }, contactName: 'Maria' }))
    expect(html).toContain('Maria')
    expect(html).toContain('Vídeo')
    expect(html).not.toContain('<img')
  })
})

describe('message bubble server rendering', () => {
  test('renders the reported API video thumbnail before downloading the video', () => {
    const original = mockConversations[0].messages.find(message => message.type === 'video')!
    expect(original.media).toBeTruthy()
    const message = { ...original, media: { ...original.media!, thumbnail: { mimeType: 'image/jpeg' as const, base64: sentVideoThumbnail, width: 32, height: 18 } } }
    const html = renderToStaticMarkup(createElement(MessageBubble, { message, onOpenMedia: () => {} }))
    expect(html).toContain(`data:image/jpeg;base64,${sentVideoThumbnail}`)
    expect(html).toContain('Abrir vídeo na galeria')
    expect(html).not.toContain('<video')
  })
  test('uses a thumbnail-first YouTube card with message details and a metadata footer', () => {
    const text = 'Um título compartilhado\nDescrição do vídeo https://youtu.be/dQw4w9WgXcQ'
    const message = mockMessage(91, conversationId, { type: 'text', text, fromMe: true, status: 'read' })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('<p'))
    expect(html).toContain('Um título compartilhado')
    expect(html).toContain('Descrição do vídeo <a href="https://youtu.be/dQw4w9WgXcQ"')
    expect(html).toContain('>https://youtu.be/dQw4w9WgXcQ</a>')
    expect(html).toContain('>youtu.be</a>')
    expect(html).toContain('aria-label="Lida"')
    expect(html).toContain('aria-label="Expandir vídeo"')
    expect(html).toContain('<dialog')
    expect(html).not.toContain('invisible')
    expect(html).not.toContain('opacity-70')
    expect(html.match(/data-slot="message-metadata"/g)?.length).toBe(1)
    expect(html.match(/<li[^>]*><div class="([^"]*)"/)?.[1].split(' ')).toContain('p-1')
  })

  test.each([false, true])('renders YouTube previews without loading an iframe before play (fromMe=%s)', fromMe => {
    const text = 'Veja https://youtu.be/dQw4w9WgXcQ e https://youtube.com/watch?v=dQw4w9WgXcQ'
    const message = mockMessage(90, conversationId, { type: 'text', text, fromMe })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    expect(html).toContain('>Veja <a href="https://youtu.be/dQw4w9WgXcQ"')
    expect(html).toContain('>https://youtu.be/dQw4w9WgXcQ</a> e <a href="https://youtube.com/watch?v=dQw4w9WgXcQ"')
    expect(html).toContain('>https://youtube.com/watch?v=dQw4w9WgXcQ</a>')
    expect(html).toContain('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(html).toContain('Reproduzir vídeo do YouTube')
    expect(html).toContain('Abrir no YouTube')
    expect(html).not.toContain('<iframe')
    expect(html.match(/data-slot="message-youtube"/g)?.length).toBe(1)
    const deleted = renderToStaticMarkup(createElement(MessageBubble, { message: { ...message, deletedAt: timestamp } }))
    expect(deleted).not.toContain('message-youtube')
    expect(deleted).not.toContain('ytimg.com')
  })

  test('escapes message text instead of interpreting HTML', () => {
    const html = renderToStaticMarkup(createElement(MessageBubble, { message: mockMessage(1, conversationId, { text: '<script>alert("x")</script>' }) }))
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  test('renders a tombstone without leaking deleted text', () => {
    const html = renderToStaticMarkup(createElement(MessageBubble, { message: mockMessage(2, conversationId, { text: 'secret deleted text', deletedAt: timestamp }) }))
    expect(html).toContain('Mensagem removida')
    expect(html).not.toContain('secret deleted text')
  })

  test('does not invent a delivery confirmation for a null status', () => {
    const html = renderToStaticMarkup(createElement(MessageBubble, { message: mockMessage(3, conversationId, { fromMe: true, status: null, sentAt: null }) }))
    expect(html).not.toMatch(/aria-label="(?:Enviada|Entregue|Lida|Reproduzida)/)
    expect(html).toContain('Horário de recebimento local')
  })

  test('shows a reply without a local ID and renders reactions within the same bubble', () => {
    const message = mockMessage(4, conversationId, {
      text: 'Resposta',
      replyTo: { messageRecordId: null, messageId: 'WA-outside', senderJid: null, type: 'text', text: 'Citação externa', contacts: [], media: null },
      reactions: [{ senderJid: '123@lid', fromMe: false, emoji: '👍', timestamp: null }],
    })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    expect(html).toContain('Citação externa')
    expect(html).toContain('👍')
    expect(html).toContain('aria-label="Reações"')
    expect((html.match(/<li\b/g) ?? []).length).toBe(2) // bubble and reaction item
  })
})

describe('sticker and audio rendering', () => {
  const fixture = mockConversations[0].messages
  const stickerMedia = fixture.find(message => message.type === 'sticker')!.media!
  const audioMedia = fixture.find(message => message.type === 'audio')!.media!

  test.each([false, true])('sticker has an unboxed frame and standalone metadata (fromMe=%s)', fromMe => {
    const message = mockMessage(20, conversationId, { type: 'sticker', text: null, media: stickerMedia, fromMe })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame).toBeDefined()
    expect(frame).not.toMatch(/(?:^|\s)(?:bg-|border|p[xy]-|rounded-)/)
    expect(html).toMatch(/class="[^"]*rounded-full bg-muted\/80 px-2 py-1[^"]*"[^>]*><time/)
    expect(html).not.toContain('Arquivo demonstrativo')
  })

  test('deleted sticker uses a normal frame and hides media and text', () => {
    const media = { ...stickerMedia, fileName: 'secret-sticker.webp', thumbnail: { mimeType: 'image/jpeg' as const, base64: 'c2VjcmV0', width: 1, height: 1 } }
    const message = mockMessage(21, conversationId, { type: 'sticker', text: 'secret caption', media, deletedAt: timestamp })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame).toContain('border bg-card')
    expect(frame).toContain('px-3.5 py-2.5')
    expect(html).toContain('Mensagem removida')
    expect(html).not.toContain('secret')
    expect(html).not.toContain('c2VjcmV0')
    expect(html).not.toContain('Arquivo demonstrativo')
    expect(html).not.toContain('rounded-full bg-muted/80')
  })

  test('audio renders accessible player and sender fallback without native controls', () => {
    const html = renderToStaticMarkup(createElement(MessageAudio, { media: audioMedia, sender: { name: 'Maria Silva', avatarUrl: null } }))
    expect(html).toContain('data-slot="audio-player"')
    expect(html).not.toContain('Áudio demonstrativo')
    expect(html).toContain('aria-label="Maria Silva"')
    expect(html).toContain('MS')
    expect(html).toMatch(/<button[^>]*aria-label="Carregando áudio"[^>]*disabled=""/)
    expect(html).toContain('aria-label="Posição do áudio"')
    expect(html).not.toMatch(/<audio\b[^>]*\bcontrols(?:[=\s>])/)
  })
})

describe('image message rendering', () => {
  const imageMedia = mockConversations[0].messages.find(message => message.type === 'image')!.media!

  test.each([false, true])('places the only metadata over the image and keeps the caption outside (fromMe=%s)', fromMe => {
    const media = { ...imageMedia, thumbnail: { mimeType: 'image/jpeg' as const, base64: 'cHJldmlldw==', width: 1, height: 1 } }
    const message = mockMessage(30, conversationId, { type: 'image', text: 'Legenda da imagem', media, fromMe, status: 'delivered' })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame?.split(' ')).toContain('p-1')
    expect(frame).not.toContain('px-3.5 py-2.5')
    expect(frame).toContain(fromMe ? 'bg-primary/15' : 'border bg-card')
    expect((html.match(/data-slot="message-metadata"/g) ?? []).length).toBe(1)

    const visual = html.match(/<div data-slot="message-media-visual" class="([^"]*)"[^>]*>([\s\S]*?<div data-slot="message-metadata" class="([^"]*)">[\s\S]*?<\/div>)<\/div>/)
    expect(visual).not.toBeNull()
    expect(visual?.[1].split(' ')).toContain('relative')
    expect(visual?.[2]).toContain('data:image/jpeg;base64,cHJldmlldw==')
    expect(visual?.[2]).toContain('<time')
    expect(visual?.[2]).not.toContain('Legenda da imagem')
    for (const className of ['absolute', 'bottom-0', 'text-white']) expect(visual?.[3].split(' ')).toContain(className)
    expect(html.indexOf('Legenda da imagem')).toBeGreaterThan(html.indexOf(visual![0]) + visual![0].length - 1)
    if (fromMe) expect(visual?.[2]).toContain('aria-label="Entregue"')
    else expect(visual?.[2]).not.toContain('aria-label="Entregue"')
  })

  test.each([false, true])('deleted image uses the normal frame and metadata without an overlay (fromMe=%s)', fromMe => {
    const media = { ...imageMedia, fileName: 'secret-image.jpg', thumbnail: { mimeType: 'image/jpeg' as const, base64: 'c2VjcmV0', width: 1, height: 1 } }
    const message = mockMessage(31, conversationId, { type: 'image', text: 'secret caption', media, fromMe, deletedAt: timestamp })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    const metadata = html.match(/data-slot="message-metadata" class="([^"]*)"/)
    expect(frame).toContain('px-3.5 py-2.5')
    expect(frame?.split(' ')).not.toContain('p-1')
    expect(html).toContain('Mensagem removida')
    expect(html).not.toContain('secret')
    expect(html).not.toContain('c2VjcmV0')
    expect(html).not.toContain('data-slot="message-media-visual"')
    expect((html.match(/data-slot="message-metadata"/g) ?? []).length).toBe(1)
    expect(metadata).not.toBeNull()
    expect(metadata?.[1].split(' ')).not.toContain('absolute')
    expect(metadata?.[1].split(' ')).not.toContain('text-white')
    expect(html).toContain('<time')
  })
})

describe('video message rendering', () => {
  const videoMedia = mockConversations[0].messages.find(message => message.type === 'video')!.media!

  test.each([false, true])('renders compact video with metadata over the preview and caption outside (fromMe=%s)', fromMe => {
    const media = { ...videoMedia, thumbnail: { mimeType: 'image/jpeg' as const, base64: 'dmlkZW8=', width: 1, height: 1 } }
    const message = mockMessage(40, conversationId, { type: 'video', text: 'Legenda do vídeo', media, fromMe, status: 'delivered' })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame?.split(' ')).toContain('p-1')
    expect(frame).not.toContain('px-3.5 py-2.5')
    expect(frame).toContain(fromMe ? 'bg-primary/15' : 'border bg-card')
    expect((html.match(/data-slot="message-metadata"/g) ?? []).length).toBe(1)

    const visual = html.match(/<div data-slot="message-media-visual" class="([^"]*)">([\s\S]*?<div data-slot="message-metadata" class="([^"]*)">[\s\S]*?<\/div>)<\/div>/)
    expect(visual).not.toBeNull()
    expect(visual?.[1].split(' ')).toContain('relative')
    expect(visual?.[2]).toContain('data:image/jpeg;base64,dmlkZW8=')
    expect(visual?.[2]).toContain('<time')
    expect(visual?.[2]).not.toContain('Legenda do vídeo')
    for (const className of ['absolute', 'bottom-0', 'text-white', 'pointer-events-none']) expect(visual?.[3].split(' ')).toContain(className)
    expect(html.indexOf('Legenda do vídeo')).toBeGreaterThan(html.indexOf(visual![0]) + visual![0].length - 1)
    expect(html).toMatch(/<div class="[^"]*"><p[^>]*>Legenda do vídeo<\/p><\/div>/)
    expect(html).not.toContain('max-w-sm space-y-2 mb-2')
    if (fromMe) expect(visual?.[2]).toContain('aria-label="Entregue"')
    else expect(visual?.[2]).not.toContain('aria-label="Entregue"')
  })

  test.each([false, true])('deleted video uses a normal frame and metadata without an overlay (fromMe=%s)', fromMe => {
    const media = { ...videoMedia, fileName: 'secret-video.mp4', thumbnail: { mimeType: 'image/jpeg' as const, base64: 'c2VjcmV0', width: 1, height: 1 } }
    const message = mockMessage(41, conversationId, { type: 'video', text: 'secret caption', media, fromMe, deletedAt: timestamp })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    const metadata = html.match(/data-slot="message-metadata" class="([^"]*)"/)
    expect(frame).toContain('px-3.5 py-2.5')
    expect(frame?.split(' ')).not.toContain('p-1')
    expect(html).toContain('Mensagem removida')
    expect(html).not.toContain('secret')
    expect(html).not.toContain('c2VjcmV0')
    expect(html).not.toContain('data-slot="message-media-visual"')
    expect((html.match(/data-slot="message-metadata"/g) ?? []).length).toBe(1)
    expect(metadata).not.toBeNull()
    for (const className of ['absolute', 'text-white', 'pointer-events-none']) expect(metadata?.[1].split(' ')).not.toContain(className)
    expect(html).toContain('<time')
  })
})

describe('document bubble', () => {
  const base = mockConversations[0].messages.find(message => message.media)!.media!
  const media = { ...base, kind: 'document' as const, fileName: 'relatorio.pdf', mimeType: 'application/pdf', size: 1200, thumbnail: { mimeType: 'image/jpeg' as const, base64: 'cHJldmlldw==', width: 1, height: 1 } }
  test.each([false, true])('keeps filename, preview and metadata in a compact bubble (fromMe=%s)', fromMe => {
    const message = mockMessage(70, conversationId, { type: 'document', text: 'Legenda', media, fromMe, status: 'read' })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message, onOpenMedia: () => {} }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame?.split(' ')).toContain('p-1')
    expect(frame).toContain(fromMe ? 'bg-primary/15' : 'border bg-card')
    expect(html).toContain('relatorio.pdf')
    expect(html).toContain('data:image/jpeg;base64,cHJldmlldw==')
    expect(html).toContain('PDF · 1,2 kB')
    expect(html).toContain('Abrir')
    expect(html).toContain('Baixar')
    expect(html).toMatch(/<div class="px-2 pb-1"><p[^>]*>Legenda<\/p><\/div>/)
    expect((html.match(/data-slot="message-metadata"/g) ?? []).length).toBe(1)
    expect(html.match(/data-slot="message-metadata" class="([^"]*)"/)?.[1].split(' ')).not.toContain('absolute')
    const cardStart = html.indexOf('data-slot="message-document"')
    const metadataIndex = html.indexOf('data-slot="message-metadata"')
    const actionsIndex = html.indexOf('aria-label="Baixar relatorio.pdf"')
    expect(metadataIndex).toBeGreaterThan(cardStart)
    expect(actionsIndex).toBeGreaterThan(metadataIndex)
    expect(html.slice(metadataIndex, actionsIndex)).toContain('<time')
    if (fromMe) expect(html.slice(metadataIndex, actionsIndex)).toContain('aria-label="Lida"')
  })
  test.each([false, true])('deleted document uses normal padding and does not leak contents (fromMe=%s)', fromMe => {
    const message = mockMessage(71, conversationId, { type: 'document', text: 'secret', media, fromMe, deletedAt: timestamp })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    const frame = html.match(/<li[^>]*><div class="([^"]*)"/)?.[1]
    expect(frame).toContain('px-3.5 py-2.5')
    expect(frame?.split(' ')).not.toContain('p-1')
    expect(html).toContain('Mensagem removida')
    expect(html).not.toContain('relatorio.pdf')
    expect(html).not.toContain('secret')
    expect(html).not.toContain('data-slot="message-document"')
    expect(html).toContain('data-slot="message-metadata"')
  })
  test.each([
    ['index.html', 'HTML', 0, '0 B'],
    ['contrato.docx', 'DOCX', null, null],
    ['sem-extensao', 'Documento', null, null],
  ] as const)('renders filename and type without a thumbnail: %s', (fileName, type, size, expectedSize) => {
    const message = mockMessage(72, conversationId, { type: 'document', media: { ...media, fileName, mimeType: null, size, thumbnail: null } })
    const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
    expect(html).toContain(fileName)
    expect(html).toContain(type)
    expect(html).not.toContain('<img')
    if (expectedSize) expect(html).toContain(expectedSize)
    else expect(html).not.toContain(' · ')
  })
})

test('renders interactive message content, safe link and disabled unsupported action', () => {
  const message = mockMessage(98, conversationId, { text: 'Corpo', interactive: { title: 'Título', footer: 'Rodapé', buttons: [
    { kind: 'url', text: 'Abrir', url: 'https://example.invalid/', id: null },
    { kind: 'reply', text: 'Sim', url: null, id: 'yes' },
    { kind: 'unsupported', text: 'Indisponível', url: null, id: null },
  ] } })
  const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
  expect(html).toContain('Título')
  expect(html).toContain('Corpo')
  expect(html).toContain('Rodapé')
  expect(html).toContain('href="https://example.invalid/"')
  expect(html).toContain('noopener noreferrer')
  expect(html).toContain('Sim')
  expect(html).toContain('disabled')
  const deleted = renderToStaticMarkup(createElement(MessageBubble, { message: { ...message, deletedAt: timestamp } }))
  expect(deleted).not.toContain('Título')
  expect(deleted).not.toContain('example.invalid')
})
