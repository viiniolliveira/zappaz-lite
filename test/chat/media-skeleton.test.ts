import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MediaGalleryPreview from '../../src/components/chat/media-gallery-preview'
import { getChatMediaMessages } from '../../src/lib/chat/media-library'
import { mockConversations, mockSessionId } from './mock-data'

const conversation = mockConversations[0]
const messages = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id)

function render(
  kind: 'image' | 'video' | 'document',
  state: 'idle' | 'loading' | 'ready' | 'error',
  thumbnail: boolean,
  url: string | null = null,
) {
  const message = messages.find((item) => item.type === kind)
  if (!message) throw new Error(`Missing ${kind} fixture`)
  return renderToStaticMarkup(
    createElement(MediaGalleryPreview, {
      message: {
        ...message,
        media: { ...message.media, thumbnail: thumbnail ? message.media.thumbnail : null },
      },
      state,
      url,
      elementRef: { current: null },
      onRetry: () => {},
    }),
  )
}

describe('media gallery preview loading', () => {
  test.each([
    'image',
    'video',
  ] as const)('%s without thumbnail shows an accessible skeleton', (kind) => {
    for (const state of ['idle', 'loading'] as const) {
      const html = render(kind, state, false)
      expect(html).toContain('data-slot="skeleton"')
      expect(html).toContain('motion-reduce:animate-none')
      expect(html).toContain('role="status"')
      expect(html).toContain('sr-only')
      expect(html).toContain('Carregando arquivo')
    }
  })

  test.each([
    'image',
    'video',
  ] as const)('%s retains thumbnail and spinner while loading', (kind) => {
    const html = render(kind, 'loading', true)
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('animate-spin')
    expect(html).not.toContain('data-slot="skeleton"')
  })

  test.each([
    'image',
    'video',
    'document',
  ] as const)('%s has no skeleton on error or ready', (kind) => {
    const error = render(kind, 'error', false)
    expect(error).toContain('role="alert"')
    expect(error).toContain('Tentar novamente')
    expect(error).not.toContain('data-slot="skeleton"')
    expect(render(kind, 'ready', false, 'blob:fixture')).not.toContain('data-slot="skeleton"')
  })

  test('a loading document does not display a skeleton', () => {
    expect(render('document', 'loading', false)).not.toContain('data-slot="skeleton"')
  })
})
