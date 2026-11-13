import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { MediaStorageEnvSchema } from '../../server/src/config-schema.ts'
import { createMediaStorage, mediaStorageKey } from '../../server/src/lib/media-storage.ts'

let root: string
const parseMediaStorageConfig = (env: Record<string, string | undefined>) => MediaStorageEnvSchema.parse(env)
beforeAll(async () => { root = await mkdtemp('/tmp/opencode/media-test-') })
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }) })

describe('media storage configuration', () => {
  test('disabled requires no S3 credentials and does not create a directory', async () => {
    const path = join(root, 'disabled')
    const env = { MEDIA_STORAGE_ENABLED: 'false', MEDIA_STORAGE_PATH: path }
    expect(parseMediaStorageConfig(env)).toMatchObject({ enabled: false })
    expect(createMediaStorage(parseMediaStorageConfig(env))).toBeNull()
    await expect(access(path)).rejects.toThrow()
    expect(parseMediaStorageConfig({})).toMatchObject({ enabled: false })
    expect(() => parseMediaStorageConfig({ MEDIA_STORAGE_DRIVER: 'invalid' })).toThrow()
    expect(() => parseMediaStorageConfig({ S3_FORCE_PATH_STYLE: 'invalid' })).toThrow()
  })
  test('accepts only explicit boolean strings and validates enabled settings', () => {
    for (const value of ['TRUE', '1', '', 'yes']) expect(() => parseMediaStorageConfig({ MEDIA_STORAGE_ENABLED: value })).toThrow()
    expect(() => parseMediaStorageConfig({ MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 'invalid' })).toThrow()
    expect(() => parseMediaStorageConfig({ MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 'fs', MEDIA_STORAGE_PATH: '' })).toThrow()
    const s3 = { MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 's3', S3_BUCKET: 'bucket', S3_REGION: 'region', S3_ACCESS_KEY_ID: 'access', S3_SECRET_ACCESS_KEY: 'secret' }
    expect(parseMediaStorageConfig(s3)).toMatchObject({ enabled: true, driver: 's3', forcePathStyle: false, supportsACL: false })
    expect(parseMediaStorageConfig({ ...s3, S3_FORCE_PATH_STYLE: 'true', S3_SUPPORTS_ACL: 'true' })).toMatchObject({ forcePathStyle: true, supportsACL: true })
    for (const value of ['TRUE', '1']) expect(() => parseMediaStorageConfig({ ...s3, S3_FORCE_PATH_STYLE: value })).toThrow()
    expect(() => parseMediaStorageConfig({ ...s3, S3_BUCKET: '' })).toThrow()
    expect(() => parseMediaStorageConfig({ ...s3, S3_ENDPOINT: 'not a url' })).toThrow()
  })
})

test('encodes traversal and separates identities; rejects invalid identity parts', () => {
  const key = mediaStorageKey('../session', 'a/b', '..\\evil')
  expect(key.split('/')).toEqual(['!Li4vc2Vzc2lvbg', '!YS9i', '!Li5cZXZpbA'])
  expect(mediaStorageKey('uuid-123', 'alpha_BETA', 'm1')).toBe('uuid-123/alpha_BETA/m1')
  expect(mediaStorageKey('!Li4vc2Vzc2lvbg', 'c', 'd')).toBe('!IUxpNHZjMlZ6YzJsdmJn/c/d')
  expect(mediaStorageKey('!Li4vc2Vzc2lvbg', 'c', 'd')).not.toBe(mediaStorageKey('../session', 'c', 'd'))
  expect(mediaStorageKey('a/b', 'c', 'd')).not.toBe(mediaStorageKey('a', 'b/c', 'd'))
  for (const bad of ['', 'x'.repeat(1025)]) expect(() => mediaStorageKey('s', bad, 'm')).toThrow()
})

test('filesystem driver persists, reads and deletes real bytes', async () => {
  const storage = createMediaStorage(parseMediaStorageConfig({ MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 'fs', MEDIA_STORAGE_PATH: join(root, 'files') }))!
  const key = mediaStorageKey('session', 'conversation', 'message')
  const bytes = Buffer.from([0, 1, 128, 255])
  expect(storage.name).toBe('local')
  expect(await storage.disk.exists(key)).toBe(false)
  await storage.disk.put(key, bytes)
  expect(await storage.disk.exists(key)).toBe(true)
  expect(Buffer.from(await storage.disk.getBytes(key))).toEqual(bytes)
  await storage.disk.delete(key)
  expect(await storage.disk.exists(key)).toBe(false)
})

test('filesystem accepts safely encoded traversal identities', async () => {
  const storage = createMediaStorage(parseMediaStorageConfig({ MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_PATH: join(root, 'encoded') }))!
  const key = mediaStorageKey('../session', 'conversation', 'message')
  await storage.disk.put(key, Buffer.from('safe'))
  expect(Buffer.from(await storage.disk.getBytes(key)).toString()).toBe('safe')
})
