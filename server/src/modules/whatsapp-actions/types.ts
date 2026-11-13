import type z from 'zod'

import type {
  ContactParamsSchema,
  GetDisplayPictureQuerySchema,
  SessionParamsSchema,
  UpdateDisplayPictureBodySchema,
  UpdateProfileNameBodySchema,
  UpdateProfileStatusBodySchema,
} from './schema.ts'

export type SessionParams = z.infer<typeof SessionParamsSchema>
export type ContactParams = z.infer<typeof ContactParamsSchema>
export type UpdateProfileNameInput = z.infer<typeof UpdateProfileNameBodySchema>
export type UpdateProfileStatusInput = z.infer<typeof UpdateProfileStatusBodySchema>
export type UpdateDisplayPictureInput = z.infer<typeof UpdateDisplayPictureBodySchema>
export type GetDisplayPictureQuery = z.infer<typeof GetDisplayPictureQuerySchema>
