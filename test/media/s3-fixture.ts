import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'
import { MediaStorageEnvSchema } from '../../server/src/config-schema.ts'

let options: unknown
class S3Driver { constructor(config: unknown) { options = config } }
class Disk { constructor(readonly driver: unknown) {} }
mock.module('flydrive', () => ({ Disk }))
mock.module('flydrive/drivers/s3', () => ({ S3Driver }))
const { createMediaStorage } = await import('../../server/src/lib/media-storage.ts')
const storage = createMediaStorage(MediaStorageEnvSchema.parse({ MEDIA_STORAGE_ENABLED: 'true', MEDIA_STORAGE_DRIVER: 's3', S3_BUCKET: 'bucket', S3_REGION: 'region', S3_ENDPOINT: 'https://storage.example', S3_ACCESS_KEY_ID: 'access', S3_SECRET_ACCESS_KEY: 'secret', S3_FORCE_PATH_STYLE: 'true', S3_SUPPORTS_ACL: 'false' }))
assert.equal(storage?.name, 's3')
assert.ok(storage?.disk.driver instanceof S3Driver)
assert.deepEqual(options, { bucket: 'bucket', region: 'region', endpoint: 'https://storage.example', credentials: { accessKeyId: 'access', secretAccessKey: 'secret' }, forcePathStyle: true, supportsACL: false, visibility: 'private', requestHandler: { requestTimeout: 60000 } })
