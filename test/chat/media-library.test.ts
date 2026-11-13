import { describe, expect, test } from 'bun:test'
import {
  getChatMediaMessages,
  isPdfMedia,
  mediaThumbnail,
} from '../../src/lib/chat/media-library.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const conversation = mockConversations[0]
const messages = conversation.messages
const image = messages.find((message) => message.type === 'image')
const video = messages.find((message) => message.type === 'video')
const audio = messages.find((message) => message.type === 'audio')
const document = messages.find((message) => message.type === 'document')
if (!image || !video || !audio || !document || !image.media?.thumbnail || !document.media)
  throw Error('Missing media fixtures')
const thumbnail = image.media.thumbnail
const documentMedia = document.media

describe('chat media library', () => {
  test('keeps scoped, non-deleted images, videos, audio and documents in their original order', () => {
    const input = [
      document,
      ...messages,
      { ...image, sessionId: 'other' },
      { ...image, conversationId: 'other' },
      { ...image, deletedAt: '2026-10-31T12:00:00Z' },
      { ...image, media: null },
      { ...image, media: video.media },
      { ...audio, media: image.media },
      { ...audio, media: null },
      { ...audio, deletedAt: '2026-10-31T12:00:00Z' },
    ]
    const result = getChatMediaMessages(input, mockSessionId, conversation.id)
    expect(result).toEqual([document, image, video, audio, document])
    expect(result[1]).toBe(image)
    expect(getChatMediaMessages(input, 'other', 'missing')).toEqual([])
  })

  test('builds a data URL only when a thumbnail exists', () => {
    const [withThumbnail, withoutThumbnail] = getChatMediaMessages(
      [image, document],
      mockSessionId,
      conversation.id,
    )
    expect(mediaThumbnail(withThumbnail)).toBe(`data:image/jpeg;base64,${thumbnail.base64}`)
    expect(mediaThumbnail(withoutThumbnail)).toBeUndefined()
  })
})

test('recognizes PDF documents by MIME or safe filename fallback only', () => {
  const base = documentMedia
  for (const [mimeType, fileName, expected] of [
    ['APPLICATION/PDF; charset=binary', 'file.bin', true],
    [null, 'REPORT.PDF', true],
    ['application/octet-stream', 'report.pdf', true],
    ['', 'report.pdf', true],
    ['text/plain', 'report.pdf', false],
    ['application/octet-stream', 'report.pdf.exe', false],
    [null, null, false],
  ] as const)
    expect(isPdfMedia({ ...base, mimeType, fileName })).toBe(expected)
  expect(isPdfMedia({ ...base, kind: 'image', mimeType: 'application/pdf' })).toBe(false)
})
