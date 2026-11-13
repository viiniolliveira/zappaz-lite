import type { ParticipantAction } from 'baileys'
import type z from 'zod'

import type {
  CreateGroupBodySchema,
  GroupParamsSchema,
  SendGroupInviteBodySchema,
  SessionParamsSchema,
  UpdateGroupBodySchema,
  UpdateGroupParticipantsBodySchema,
} from './schema.ts'

export type SessionParams = z.infer<typeof SessionParamsSchema>
export type GroupParams = z.infer<typeof GroupParamsSchema>
export type CreateGroupInput = z.infer<typeof CreateGroupBodySchema>
export type UpdateGroupInput = z.infer<typeof UpdateGroupBodySchema>
export type UpdateGroupParticipantsInput = z.infer<typeof UpdateGroupParticipantsBodySchema>
export type SendGroupInviteInput = z.infer<typeof SendGroupInviteBodySchema>
export type GroupParticipantAction = ParticipantAction
