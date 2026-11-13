import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageLocation from '../../src/components/chat/messages/message-location'
import { extractChatThumbnail, extractMessageThumbnail } from '../../server/src/lib/chat-thumbnail.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'
import { messageSchema } from '../../src/lib/chat/schemas.ts'

const location = { latitude: -23.5505, longitude: -46.6333, name: 'São Paulo', address: 'Praça da Sé', thumbnail: null }

describe('WhatsApp location cards', () => {
  test('accepts base64 location thumbnails from serialized WhatsApp payloads', async () => {
    const result = await extractChatThumbnail(mockThumbnailBase64)
    expect(result).toMatchObject({ thumbnailMimeType: 'image/jpeg', thumbnailBase64: mockThumbnailBase64, thumbnailWidth: 80, thumbnailHeight: 60 })
    for (const invalid of ['', 'not base64!', 'AAAA', 'A'.repeat(349532), `data:image/jpeg;base64,${mockThumbnailBase64}`]) {
      expect(await extractChatThumbnail(invalid)).toBeNull()
    }
  })
  test('extracts validated thumbnails from static and live locations', async () => {
    const payload = { degreesLatitude: 0, degreesLongitude: 0, jpegThumbnail: Buffer.from(mockThumbnailBase64, 'base64') }
    for (const content of [{ locationMessage: payload }, { liveLocationMessage: payload }]) {
      expect(await extractMessageThumbnail(content)).toMatchObject({ mimeType: 'image/jpeg', base64: mockThumbnailBase64, width: 80, height: 60 })
    }
    expect(await extractMessageThumbnail({ locationMessage: { ...payload, jpegThumbnail: new Uint8Array([1, 2]) } })).toBeNull()
    expect(await extractMessageThumbnail({ locationMessage: { degreesLatitude: 0, degreesLongitude: 0 } })).toBeNull()
  })

  test('renders WhatsApp thumbnail and opens coordinates without an embed or external images', () => {
    const html = renderToStaticMarkup(createElement(MessageLocation, { location: { ...location, thumbnail: { mimeType: 'image/jpeg', base64: mockThumbnailBase64, width: 80, height: 60 } } }))
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=-23.5505%2C-46.6333')
    expect(html).toContain('São Paulo')
    expect(html).toContain('Praça da Sé')
    expect(html).toContain('noopener noreferrer')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('src="http')
  })

  test('keeps a clickable location without a thumbnail, including zero coordinates', () => {
    const html = renderToStaticMarkup(createElement(MessageLocation, { location: { ...location, latitude: 0, longitude: 0, name: null, address: null } }))
    expect(html).toContain('query=0%2C0')
    expect(html).toContain('Localização compartilhada')
    expect(html).not.toContain('<img')
  })

  test('does not link unavailable or invalid coordinates', () => {
    for (const invalid of [null, { ...location, name: null, address: null, latitude: 91 }, { ...location, name: null, address: null, longitude: NaN }]) {
      const html = renderToStaticMarkup(createElement(MessageLocation, { location: invalid }))
      expect(html).toContain('Localização indisponível')
      expect(html).not.toContain('<a')
    }
  })

  test('accepts and renders a place without coordinates, searching its name and address', () => {
    const place = messageSchema.shape.location.parse({ latitude: null, longitude: null, name: 'Google São Paulo', address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil', url: 'www.google.com', thumbnail: null })
    const html = renderToStaticMarkup(createElement(MessageLocation, { location: place }))
    expect(html).toContain('Google São Paulo')
    expect(html).toContain('Av. Brigadeiro Faria Lima 3477')
    expect(html).toContain(`query=${encodeURIComponent(`${place!.name}, ${place!.address}`)}`)
    expect(html).not.toContain('Localização indisponível')
    expect(html).not.toContain('query=0%2C0')
  })

  test('only links safe HTTP URLs when no other location details are available', () => {
    for (const url of ['www.google.com', 'https://example.com/place']) {
      const html = renderToStaticMarkup(createElement(MessageLocation, { location: { latitude: null, longitude: null, name: null, address: null, thumbnail: null, url } }))
      expect(html).toContain('href="https://')
    }
    for (const url of ['javascript:alert(1)', 'data:text/html,unsafe', 'invalid']) {
      const html = renderToStaticMarkup(createElement(MessageLocation, { location: { latitude: null, longitude: null, name: null, address: null, thumbnail: null, url } }))
      expect(html).not.toContain('<a')
    }
  })
})
