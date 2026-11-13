import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { extractChatThumbnail, extractReplyThumbnail } from '../../server/src/lib/chat-thumbnail.ts'

describe('chat thumbnail validation', () => {
  test.each(['imageMessage', 'videoMessage'] as const)('extracts a quoted %s preview without requiring a stored original', async kind => {
    const jpeg = await sharp({ create: { width: 13, height: 7, channels: 3, background: '#c30' } }).jpeg().toBuffer()
    expect(await extractReplyThumbnail({ extendedTextMessage: { text: 'Olha aqui', contextInfo: { stanzaId: 'quoted', quotedMessage: { [kind]: { jpegThumbnail: jpeg } } } } })).toEqual({ mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 })
  })

  test('handles missing and invalid quoted previews', async () => {
    expect(await extractReplyThumbnail(null)).toBeNull()
    expect(await extractReplyThumbnail({ extendedTextMessage: { contextInfo: { quotedMessage: { videoMessage: { jpegThumbnail: Buffer.from('invalid') } } } } })).toBeNull()
  })
  test('extracts an actual JPEG from bytes and serialized Buffer', async () => {
    const jpeg = await sharp({ create: { width: 13, height: 7, channels: 3, background: '#c30' } }).jpeg().toBuffer()
    const expected = { thumbnailBase64: jpeg.toString('base64'), thumbnailMimeType: 'image/jpeg', thumbnailWidth: 13, thumbnailHeight: 7 }
    expect(await extractChatThumbnail(new Uint8Array(jpeg))).toEqual(expected)
    expect(await extractChatThumbnail(jpeg.toJSON())).toEqual(expected)
  })

  test('rejects invalid, oversized, corrupt and non-JPEG previews', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer()
    const jpeg = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    for (const value of [null, undefined, new Uint8Array(), new Uint8Array(262145), { type: 'Buffer', data: Array(262145).fill(0) }, { type: 'Buffer', data: [256] }, png, jpeg.subarray(0, Math.floor(jpeg.length / 2)), Buffer.from('not a jpeg')]) {
      expect(await extractChatThumbnail(value)).toBeNull()
    }
  })
})
