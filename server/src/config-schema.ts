import { constants as bufferConstants } from 'node:buffer'
import { z } from 'zod'
import { parseAppUrl } from './lib/app-url.ts'

const boolean = z.enum(['true', 'false']).transform((value) => value === 'true')
const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
)
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional())
const retentionDays = (days: number) =>
  z
    .union([
      z.literal('off').transform(() => null),
      z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number)
        .refine(
          (value) =>
            Number.isSafeInteger(value) &&
            Number.isFinite(new Date(Date.now() - value * 86_400_000).getTime()),
          'Must be a positive integer of days within the supported date range or off',
        ),
    ])
    .default(days)

export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:\/\//.test(value), 'Must be a PostgreSQL URL'),
})

export const AdminSeedSchema = z.object({
  ADMIN_EMAIL: z.email().transform((email) => email.toLowerCase()),
  ADMIN_PASSWORD: z.string().min(8).max(128),
})

export const AdminEnvSchema = z
  .object({
    ADMIN_EMAIL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AdminSeedSchema.shape.ADMIN_EMAIL.optional(),
    ),
    ADMIN_PASSWORD: z.preprocess(
      (value) => (value === '' ? undefined : value),
      AdminSeedSchema.shape.ADMIN_PASSWORD.optional(),
    ),
    ADMIN_RESET_PASSWORD: boolean.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.ADMIN_RESET_PASSWORD) {
      for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD'] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required for administrator password reset',
          })
      }
    }
  })

export const S3StorageSchema = z.object({
  bucket: z.string().min(1),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  endpoint: z.url().optional(),
  forcePathStyle: z.boolean(),
  supportsACL: z.boolean(),
})

export const MediaStorageEnvSchema = z
  .object({
    MEDIA_STORAGE_ENABLED: boolean.default(false),
    MEDIA_STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
    MEDIA_STORAGE_PATH: z.string().min(1).default('./storage/media'),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ENDPOINT: optionalUrl,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: boolean.default(false),
    S3_SUPPORTS_ACL: boolean.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.MEDIA_STORAGE_ENABLED && env.MEDIA_STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_BUCKET',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const) {
        if (!env[key])
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when S3 persistence is enabled',
          })
      }
    }
  })
  .transform((env) => ({
    enabled: env.MEDIA_STORAGE_ENABLED,
    driver: env.MEDIA_STORAGE_DRIVER,
    path: env.MEDIA_STORAGE_PATH,
    bucket: env.S3_BUCKET,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    supportsACL: env.S3_SUPPORTS_ACL,
  }))

export type MediaStorageConfig = z.infer<typeof MediaStorageEnvSchema>
export type AdminConfig = z.infer<typeof AdminEnvSchema>

export const EnvSchema = z
  .object({
    ...DatabaseEnvSchema.shape,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CLIENT_SECRET: z.string().min(1),
    APP_URL: z.string().optional(),
    PORT: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(65535))
      .default(3001),
    TRUST_PROXY: boolean.default(false),
    MEDIA_MAX_FILE_SIZE_MB: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .refine(
        (value) =>
          Number.isSafeInteger(value) &&
          4 * Math.ceil((value * 1024 * 1024) / 3) + 1024 * 1024 <= bufferConstants.MAX_LENGTH,
        'Must be a positive integer of MiB within the supported request buffer size',
      )
      .default(25),
    MESSAGE_RETENTION_DAYS: retentionDays(90),
    WEBHOOK_LOG_RETENTION_DAYS: retentionDays(1),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.CLIENT_SECRET.length < 32 ||
        new Set(env.CLIENT_SECRET).size < 10 ||
        /change.?me|replace.?me|your.?secret|example|password|fixture/i.test(env.CLIENT_SECRET))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLIENT_SECRET'],
        message: 'Use a random production secret of at least 32 characters, not a placeholder',
      })
    }
  })
  .transform((env, ctx) => {
    let appUrl: string
    try {
      appUrl = parseAppUrl(env.APP_URL, env.NODE_ENV === 'production')
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_URL'],
        message: error instanceof Error ? error.message : 'Invalid application URL',
      })
      return z.NEVER
    }
    return {
      isProduction: env.NODE_ENV === 'production',
      trustProxy: env.TRUST_PROXY,
      appUrl,
      port: env.PORT,
      clientSecret: env.CLIENT_SECRET,
      dbUrl: env.DATABASE_URL,
      messageRetentionDays: env.MESSAGE_RETENTION_DAYS,
      webhookLogRetentionDays: env.WEBHOOK_LOG_RETENTION_DAYS,
      mediaMaxFileSizeMb: env.MEDIA_MAX_FILE_SIZE_MB,
      mediaMaxFileSizeBytes: env.MEDIA_MAX_FILE_SIZE_MB * 1024 * 1024,
      mediaMaxBase64Chars: 4 * Math.ceil((env.MEDIA_MAX_FILE_SIZE_MB * 1024 * 1024) / 3),
      mediaMultipartBodyBytes: (env.MEDIA_MAX_FILE_SIZE_MB + 1) * 1024 * 1024,
      mediaRequestBodyBytes:
        4 * Math.ceil((env.MEDIA_MAX_FILE_SIZE_MB * 1024 * 1024) / 3) + 1024 * 1024,
    }
  })

export function parseConfig(env: Record<string, string | undefined>) {
  return {
    ...EnvSchema.parse(env),
    admin: AdminEnvSchema.parse(env),
    mediaStorage: MediaStorageEnvSchema.parse(env),
  }
}
