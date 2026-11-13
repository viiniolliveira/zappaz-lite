import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VideoPlayerPro } from '../../src/components/ruixen/video-player-pro'
import MediaGalleryPreview from '../../src/components/chat/media-gallery-preview'
import { getChatMediaMessages } from '../../src/lib/chat/media-library'
import { mockConversations, mockSessionId } from './mock-data'

describe('VideoPlayerPro', () => {
  test('renders the provided source and accessible custom controls without native controls', () => {
    const html = renderToStaticMarkup(createElement(VideoPlayerPro, { src: 'blob:example', poster: 'data:image/png;base64,AA==', label: 'Vídeo teste', className: 'custom-player' }))
    expect(html).toContain('data-slot="video-player-pro"')
    expect(html).toContain('src="blob:example"')
    expect(html).toContain('poster="data:image/png;base64,AA=="')
    expect(html).toContain('aria-label="Vídeo teste"')
    expect(html).toContain('custom-player')
    expect(html).toContain('aria-label="Posição do vídeo"')
    expect(html).toContain('aria-label="Reproduzir vídeo"')
    expect(html).not.toMatch(/<video[^>]*\scontrols(?:\s|=|>)/)
  })
  test('gallery renders the custom player only when a video URL is available', () => {
    const conversation = mockConversations[0]
    const video = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id).find(message => message.type === 'video')!
    const props = { message: video, blob: null, state: 'ready' as const, elementRef: { current: null }, onRetry: () => {} }
    const withUrl = renderToStaticMarkup(createElement(MediaGalleryPreview, { ...props, url: 'blob:gallery-video' }))
    const withoutUrl = renderToStaticMarkup(createElement(MediaGalleryPreview, { ...props, url: null }))
    expect(withUrl).toContain('data-slot="video-player-pro"')
    expect(withUrl).toContain('src="blob:gallery-video"')
    expect(withoutUrl).not.toContain('data-slot="video-player-pro"')
  })
})
