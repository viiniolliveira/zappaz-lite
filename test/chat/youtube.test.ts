import { describe, expect, test } from 'bun:test'
import { youtubeVideoId, youtubeVideosInText } from '../../src/lib/chat/youtube.ts'

const id = 'dQw4w9WgXcQ'

describe('YouTube message links', () => {
  test.each([
    `https://www.youtube.com/watch?v=${id}&t=30`,
    `https://youtu.be/${id}?si=shared`,
    `https://m.youtube.com/shorts/${id}`,
    `https://youtube.com/embed/${id}`,
    `https://youtube.com/live/${id}`,
  ])('recognizes %s', url => expect(youtubeVideoId(url)).toBe(id))

  test.each([
    'not a url',
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://evil.test/youtu.be/${id}`,
    `https://youtube.com@evil.test/watch?v=${id}`,
    `javascript:youtube.com/watch?v=${id}`,
    'https://youtube.com/watch?v=invalid',
    `https://youtu.be/${id}/extra`,
    'https://youtube.com/playlist?list=test',
  ])('rejects %s', url => expect(youtubeVideoId(url)).toBeNull())

  test('extracts distinct videos from text with punctuation', () => {
    expect(youtubeVideosInText(`Veja (https://youtu.be/${id}). Repetido https://youtube.com/watch?v=${id}! Outro https://youtu.be/jNQXAC9IVRw`)).toEqual([id, 'jNQXAC9IVRw'])
    expect(youtubeVideosInText('Texto comum sem vídeo')).toEqual([])
  })
})
