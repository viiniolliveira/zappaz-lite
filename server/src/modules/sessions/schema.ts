import { z } from 'zod'
import { PageSchema, PageSizeSchema } from '../../common/pagination.ts'
import { SignatureNameSchema } from '../../common/schema.ts'

const SessionConfigSchema = z.object({
  signatureEnabled: z.boolean(),
  signatureName: SignatureNameSchema,
  messageOnCall: z.string().max(4096).optional(),
  rejectCalls: z.boolean(),
  ignoreGroups: z.boolean(),
  syncFullHistory: z.boolean(),
  markOnlineOnConnect: z.boolean(),
  clientConnectionName: z.string().max(100),
})

export const CreateSessionBodySchema = z.object({
  enabled: z.boolean().optional().default(true),
  displayName: z.string().max(100).optional(),
  config: SessionConfigSchema.extend({
    signatureEnabled: SessionConfigSchema.shape.signatureEnabled.default(false),
    signatureName: SessionConfigSchema.shape.signatureName.default(''),
    rejectCalls: SessionConfigSchema.shape.rejectCalls.default(false),
    ignoreGroups: SessionConfigSchema.shape.ignoreGroups.default(false),
    syncFullHistory: SessionConfigSchema.shape.syncFullHistory.default(false),
    markOnlineOnConnect: SessionConfigSchema.shape.markOnlineOnConnect.default(false),
    clientConnectionName: SessionConfigSchema.shape.clientConnectionName.default('ZappaZ'),
  }),
})

export const UpdateSessionBodySchema = z
  .object({
    enabled: z.boolean().optional(),
    displayName: z.string().max(100).optional(),
    config: SessionConfigSchema.partial().optional(),
  })
  .strict()

export const SessionParamsSchema = z.object({
  sessionId: z.string(),
})

export const GetSessionsQuerySchema = z.object({
  archived: z.enum(['true', 'false']).optional().default('false'),
  page: PageSchema,
  pageSize: PageSizeSchema,
})
