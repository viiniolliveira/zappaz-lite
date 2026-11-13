import type z from 'zod'

import type {
  PrivacyParamsSchema,
  UpdateDefaultDisappearingModeSchema,
  UpdateGroupsAddPrivacyValueSchema,
  UpdateOnlinePrivacyValueSchema,
  UpdatePrivacyValueSchema,
  UpdateReadReceiptsPrivacyValueSchema,
} from './schema.ts'

export type PrivacyParams = z.infer<typeof PrivacyParamsSchema>
export type UpdatePrivacyInput = z.infer<typeof UpdatePrivacyValueSchema>
export type UpdateOnlinePrivacyInput = z.infer<typeof UpdateOnlinePrivacyValueSchema>
export type UpdateReadReceiptsPrivacyInput = z.infer<typeof UpdateReadReceiptsPrivacyValueSchema>
export type UpdateGroupsAddPrivacyInput = z.infer<typeof UpdateGroupsAddPrivacyValueSchema>
export type UpdateDefaultDisappearingModeInput = z.infer<typeof UpdateDefaultDisappearingModeSchema>
