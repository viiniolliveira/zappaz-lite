import z from 'zod'
import { MediaSourceSchema } from '../../lib/outbound-policy.ts'

export const SessionParamsSchema = z.object({
  sessionId: z.string(),
})

export const ContactParamsSchema = SessionParamsSchema.extend({
  jid: z.string(),
})

export const UpdateProfileNameBodySchema = z.object({
  name: z.string().min(1),
})

export const UpdateProfileStatusBodySchema = z.object({
  status: z.string().min(1),
})

export const UpdateDisplayPictureBodySchema = z.object({
  identifier: z.string(),
  source: MediaSourceSchema,
})

export const GetDisplayPictureQuerySchema = z.object({
  identifier: z.string(),
})
