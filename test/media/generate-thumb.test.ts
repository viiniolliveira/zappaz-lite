import { expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { generateThumb } from '../../server/src/lib/generate-thumb.ts'

test('native thumbnails preserve aspect ratio and emit decodable JPEG base64', async () => {
  const input = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#c83b42' } }).png().toBuffer()
  const thumb = await generateThumb(input)
  expect(thumb.thumbnailMimeType).toBe('image/jpeg')
  expect(thumb.thumbnailWidth).toBe(64)
  expect(thumb.thumbnailHeight).toBe(32)
  const metadata = await sharp(Buffer.from(thumb.thumbnailBase64, 'base64')).metadata()
  expect(metadata.format).toBe('jpeg')
  expect(metadata.width).toBe(64)
  expect(metadata.height).toBe(32)
})

test('native thumbnails do not upscale small images', async () => {
  const input = await sharp({ create: { width: 20, height: 40, channels: 3, background: '#123456' } }).jpeg().toBuffer()
  const thumb = await generateThumb(input)
  expect([thumb.thumbnailWidth, thumb.thumbnailHeight]).toEqual([20, 40])
})

test('detailed images produce valid thumbnails within the base64 byte budget', async () => {
  const input = await sharp(randomBytes(64 * 64 * 3), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer()
  const thumb = await generateThumb(input)
  expect(Buffer.byteLength(thumb.thumbnailBase64, 'utf8')).toBeLessThanOrEqual(4096)
  const output = Buffer.from(thumb.thumbnailBase64, 'base64')
  await sharp(output).stats()
  const metadata = await sharp(output).metadata()
  expect(metadata.format).toBe('jpeg')
  expect(metadata.width).toBe(thumb.thumbnailWidth)
  expect(metadata.height).toBe(thumb.thumbnailHeight)
  expect(thumb.thumbnailWidth).toBeLessThanOrEqual(64)
  expect(thumb.thumbnailHeight).toBeLessThanOrEqual(64)
})

test('native thumbnail generation rejects invalid image data', async () => {
  await expect(generateThumb(Buffer.from('not an image'))).rejects.toThrow()
})
