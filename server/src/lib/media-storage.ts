import { resolve } from 'node:path'
import { Disk } from 'flydrive'
import { FSDriver } from 'flydrive/drivers/fs'
import { S3Driver } from 'flydrive/drivers/s3'
import { type MediaStorageConfig, S3StorageSchema } from '../config-schema.ts'

export function mediaStorageKey(sessionId: string, conversationId: string, messageId: string) {
  return [sessionId, conversationId, messageId]
    .map((part) => {
      // Encode all dots/slashes too; even legacy session IDs cannot traverse paths.
      if (!part || part.length > 1024) throw new Error('Invalid media identity')
      return /^[A-Za-z0-9_-]+$/.test(part) ? part : `!${Buffer.from(part).toString('base64url')}`
    })
    .join('/')
}
export function createMediaStorage(settings: MediaStorageConfig) {
  if (!settings.enabled) return null
  // Explicit deletion may need S3 even when it is not the active persistence driver.
  const s3 = settings.driver === 's3' ? S3StorageSchema.parse(settings) : null
  const disk = !s3
    ? new Disk(
        new FSDriver({
          location: resolve(settings.path),
          visibility: 'private',
        }),
      )
    : new Disk(
        new S3Driver({
          bucket: s3.bucket,
          region: s3.region,
          endpoint: s3.endpoint,
          credentials: {
            accessKeyId: s3.accessKeyId,
            secretAccessKey: s3.secretAccessKey,
          },
          forcePathStyle: s3.forcePathStyle,
          supportsACL: s3.supportsACL,
          visibility: 'private',
          requestHandler: { requestTimeout: 60000 },
        }),
      )
  return { disk, name: settings.driver === 'fs' ? ('local' as const) : ('s3' as const) }
}
let storage: ReturnType<typeof createMediaStorage> | undefined
export function getMediaStorage(settings: MediaStorageConfig) {
  if (storage === undefined) storage = createMediaStorage(settings)
  return storage
}
