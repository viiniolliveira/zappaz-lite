import type { WaSession } from '@generated/prisma'
import type { z } from 'zod'
import type { AuthUser } from '../../lib/api-key-scope.ts'

import type {
  CreateSessionBodySchema,
  GetSessionsQuerySchema,
  SessionParamsSchema,
  UpdateSessionBodySchema,
} from './schema.ts'

export type Session = WaSession
export type SessionUser = AuthUser
export type CreateSessionInput = z.infer<typeof CreateSessionBodySchema>
export type UpdateSessionInput = z.infer<typeof UpdateSessionBodySchema>
export type GetSessionsQuery = z.infer<typeof GetSessionsQuerySchema>
export type SessionParams = z.infer<typeof SessionParamsSchema>

export interface GetSessionsInput {
  query: GetSessionsQuery
  user: SessionUser | null
}
