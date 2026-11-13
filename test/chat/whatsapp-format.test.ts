import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { hasWhatsAppLink, parseWhatsAppText } from '../../shared/whatsapp-format.ts'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import MessageFormattedText from '../../src/components/chat/messages/message-formatted-text.tsx'
import MessageReply from '../../src/components/chat/messages/message-reply.tsx'
import MessageText from '../../src/components/chat/messages/message-text.tsx'
import { youtubeVideosInText } from '../../src/lib/chat/youtube.ts'
import { mockConversations, mockMessage } from './mock-data.ts'

const render = (text: string) => renderToStaticMarkup(createElement(MessageFormattedText, { text }))
const video = 'https://youtu.be/dQw4w9WgXcQ'

describe('WhatsApp formatting', () => {
  test('returns offsets and nested styles', () => {
    expect(parseWhatsAppText('Oi *um _dois_* fim')).toEqual([
      { kind: 'text', offset: 0, value: 'Oi ' },
      {
        kind: 'strong',
        offset: 3,
        children: [
          { kind: 'text', offset: 0, value: 'um ' },
          { kind: 'em', offset: 3, children: [{ kind: 'text', offset: 0, value: 'dois' }] },
        ],
      },
      { kind: 'text', offset: 14, value: ' fim' },
    ])
  })

  test.each([
    ['*negrito*', '<strong>negrito</strong>'],
    ['_itálico_', '<em>itálico</em>'],
    ['~riscado~', '<del>riscado</del>'],
    ['*Lucas - Financeiro:*', '<strong>Lucas - Financeiro:</strong>'],
    ['*uma\nduas*', '<strong>uma\nduas</strong>'],
    [
      '`*texto* https://example.com`',
      '<code class="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[0.9em] whitespace-pre-wrap">*texto* https://example.com</code>',
    ],
  ])('formats %s', (input, expected) => expect(render(input)).toContain(expected))

  test.each([
    '*aberto',
    '_aberto',
    '~aberto',
    '**duplo**',
    '__duplo__',
    'a_b_c',
    'ação_teste_fim',
    '中*文*字',
    '* espaço*',
    '*espaço *',
    '``',
  ])('keeps %s literal', (input) => {
    expect(render(input)).toBe(input)
  })

  test('protects multiline code from styles and links', () => {
    const html = render('```*bold*\nhttps://example.com```')
    expect(html).toContain('*bold*\nhttps://example.com')
    expect(html).toContain('<code ')
    expect(html).not.toContain('<strong>')
    expect(html).not.toContain('<a ')
  })

  test('renders safe links, punctuation and escaped HTML', () => {
    const html = render(
      '<script>alert(1)</script> https://example.com/a_b?q=x*y! javascript:alert(1) data:text/html,test https://user:pass@example.com',
    )
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('href="https://example.com/a_b?q=x*y"')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('</a>!')
    expect((html.match(/<a /g) ?? []).length).toBe(1)
    expect(html).toContain('https://user:pass@example.com')
  })

  test.each([
    ['https://example.com/wiki/Function_(math)', 'https://example.com/wiki/Function_(math)', ''],
    ['https://example.com/a[b]', 'https://example.com/a[b]', ''],
    ['https://example.com/a{b}', 'https://example.com/a{b}', ''],
    ['https://example.com/a(b))].,!?;:', 'https://example.com/a(b)', ')].,!?;:'],
    ['https://example.com/a[b]]}', 'https://example.com/a[b]', ']}'],
    ['https://example.com/a{b}})', 'https://example.com/a{b}', '})'],
  ])('preserves balanced URL delimiters and separates excess in %s', (input, value, suffix) => {
    const href = new URL(value).href
    expect(parseWhatsAppText(input)).toEqual([
      { kind: 'link', offset: 0, value, href },
      ...(suffix ? [{ kind: 'text', offset: value.length, value: suffix }] : []),
    ])
    const html = render(input)
    expect(html).toContain(`href="${href}" target="_blank" rel="noopener noreferrer"`)
    expect(html).toContain(`>${value}</a>${suffix}`)
  })

  test('keeps balanced parentheses inside a surrounded link and punctuation outside', () => {
    const value = 'https://example.com/wiki/Function_(math)'
    expect(parseWhatsAppText(`(${value}).`)).toEqual([
      { kind: 'text', offset: 0, value: '(' },
      { kind: 'link', offset: 1, value, href: value },
      { kind: 'text', offset: value.length + 1, value: ').' },
    ])
    const html = render(`(${value}).`)
    expect(html).toContain(`href="${value}" target="_blank" rel="noopener noreferrer"`)
    expect(html).toContain(`>${value}</a>).`)
  })

  test('handles long plain text without changing it', () => {
    const input = 'palavra '.repeat(20000)
    expect(parseWhatsAppText(input)).toEqual([{ kind: 'text', offset: 0, value: input }])
  })
})

describe('formatted message integration', () => {
  test.each([
    false,
    true,
  ])('formats sent and received text and image captions (fromMe=%s)', (fromMe) => {
    const conversationId = '22222222-2222-4222-8222-222222222222'
    const image = mockConversations[0].messages.find((message) => message.type === 'image')?.media
    if (!image) throw new Error('Image fixture is missing media')
    for (const overrides of [{ type: 'text' as const }, { type: 'image' as const, media: image }]) {
      const message = mockMessage(30, conversationId, {
        ...overrides,
        text: '*Lucas - Financeiro:*\nOlá _mundo_',
        fromMe,
      })
      const html = renderToStaticMarkup(createElement(MessageBubble, { message }))
      expect(html).toContain('<strong>Lucas - Financeiro:</strong>')
      expect(html).toContain('<em>mundo</em>')
    }
  })

  test('formats quotes without anchors inside their button', () => {
    const reply = {
      messageRecordId: null,
      messageId: 'outside',
      senderJid: null,
      type: 'text' as const,
      text: `*Veja* ${video}`,
      contacts: [],
      media: null,
    }
    const html = renderToStaticMarkup(createElement(MessageReply, { reply, onNavigate: () => {} }))
    expect(html).toContain('<button')
    expect(html).toContain('<strong>Veja</strong>')
    expect(html).toContain(video)
    expect(html).not.toContain('<a ')
  })

  test('embeds normal and formatted YouTube links but not links in code', () => {
    expect(youtubeVideosInText(`normal ${video} e *_${video}_*`)).toEqual(['dQw4w9WgXcQ'])
    expect(youtubeVideosInText(`\`${video}\`\n\`\`\`${video}\`\`\``)).toEqual([])
    const code = renderToStaticMarkup(createElement(MessageText, { text: `\`${video}\`` }))
    expect(code).toContain('<code ')
    expect(code).not.toContain('message-youtube')
    const formatted = renderToStaticMarkup(
      createElement(MessageText, { text: `*Título*\n_${video}_` }),
    )
    expect(formatted).toContain('message-youtube')
    expect(formatted).toContain('<strong>Título</strong>')
  })
})

describe('hasWhatsAppLink', () => {
  test.each([
    ['https://example.com', true],
    ['Acesse http://example.com e https://example.org', true],
    ['*Veja _https://example.com/a(b)_*', true],
    ['(https://example.com/a[b]).', true],
    ['`https://example.com`', false],
    ['```https://example.com```', false],
    ['*`https://example.com`*', false],
    ['https://user:pass@example.com', false],
    ['javascript:alert(1)', false],
    ['sem links', false],
    ['', false],
    [null, false],
    [undefined, false],
  ])('detects links in %s', (text, expected) => {
    expect(hasWhatsAppLink(text)).toBe(expected)
  })
})
