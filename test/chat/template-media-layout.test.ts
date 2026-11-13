import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { mockConversations, mockMessage } from './mock-data.ts'

const conversationId = '22222222-2222-4222-8222-222222222222'
const interactive = { title: null, footer: 'Rodapé do template', buttons: [] }

test.each([
  'image',
  'video',
] as const)('template %s fills its card with or without a thumbnail', async (type) => {
  const media = mockConversations[0].messages.find((message) => message.type === type)?.media
  if (!media) throw new Error(`Missing ${type} fixture`)
  for (const thumbnail of [media.thumbnail, null]) {
    const message = mockMessage(810, conversationId, {
      type,
      text: 'Legenda que deve ocupar toda a largura do template',
      media: { ...media, thumbnail },
      interactive,
    })
    const html = renderToStaticMarkup(
      createElement(MessageBubble, { message, onOpenMedia: () => {} }),
    )
    const widths: string[][] = []
    await new HTMLRewriter()
      .on('[data-slot="message-media-visual"]', {
        element(element) {
          widths.push((element.getAttribute('class') ?? '').split(' '))
        },
      })
      .on('[data-slot="message-media-visual"] img', {
        element(element) {
          expect((element.getAttribute('class') ?? '').split(' ')).toContain('w-full')
        },
      })
      .transform(new Response(html))
      .text()
    expect(widths).toHaveLength(1)
    expect(widths[0]).toContain('w-full')
    expect(widths[0]).not.toContain('w-fit')
    expect(html).toContain('space-y-2 text-sm w-full min-w-0')
    expect(html).not.toContain('w-fit')
    expect(html.match(/data-slot="message-metadata"/g)).toHaveLength(1)
  }
})

test('standalone images keep their intrinsic media and caption width', () => {
  const media = mockConversations[0].messages.find((message) => message.type === 'image')?.media
  if (!media) throw new Error('Missing image fixture')
  const html = renderToStaticMarkup(
    createElement(MessageBubble, {
      message: mockMessage(811, conversationId, { type: 'image', text: 'Legenda', media }),
    }),
  )
  expect(html).not.toContain('message-interactive')
  expect(html).toContain('w-fit')
  expect(html).toContain('[contain:inline-size]')
})
