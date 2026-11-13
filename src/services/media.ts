import { z } from 'zod'
import { request } from '@/lib/api-client'

const mediaLimitsSchema = z.object({
  status: z.literal('success'),
  data: z.object({
    maxFileSizeBytes: z.number().int().positive(),
    maxFileSizeMb: z.number().int().positive(),
  }),
})

export async function getMediaLimits(signal?: AbortSignal) {
  return mediaLimitsSchema.parse(await request<unknown>('/api/v1/media/limits', { signal })).data
}
