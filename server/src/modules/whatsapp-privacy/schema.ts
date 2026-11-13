import z from 'zod'

export const PrivacyParamsSchema = z.object({
  sessionId: z.string(),
})

export const WAPrivacyValueSchema = z.enum(['contacts', 'all', 'contact_blacklist', 'none'])

export const UpdatePrivacyValueSchema = z.object({
  privacy: WAPrivacyValueSchema,
})

export const UpdateOnlinePrivacyValueSchema = z.object({
  privacy: z.enum(['all', 'match_last_seen']),
})

export const UpdateReadReceiptsPrivacyValueSchema = z.object({
  privacy: z.enum(['all', 'none']),
})

export const UpdateGroupsAddPrivacyValueSchema = z.object({
  privacy: z.enum(['all', 'contacts', 'contact_blacklist']),
})

export const UpdateDefaultDisappearingModeSchema = z.object({
  mode: z.enum(['ONE_DAY', 'ONE_WEEK', 'THREE_MONTHS', 'OFF']),
})
