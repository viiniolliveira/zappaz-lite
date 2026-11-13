import type { Context } from 'hono'
import { config } from '../../config.ts'
import type { AppEnv } from '../../create-app.ts'

export function getMediaLimitsController(c: Context<AppEnv>) {
  return c.json({
    status: 'success',
    data: {
      maxFileSizeBytes: config.mediaMaxFileSizeBytes,
      maxFileSizeMb: config.mediaMaxFileSizeMb,
    },
  })
}
