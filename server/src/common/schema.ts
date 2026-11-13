import z from 'zod'
import { MediaSourceSchema, OutboundUrlSchema } from '../lib/outbound-policy.ts'

export const DEFAULT_CLIENT_CONN_NAME = 'ZappaZ'

export const SignatureNameSchema = z
  .string()
  .trim()
  .max(100)
  .regex(/^[^\r\n]*$/, 'Use uma única linha para a assinatura')
export const TextSignatureSchema = z.object({
  signMessage: z
    .boolean()
    .optional()
    .describe('Assina este envio de texto; omitido usa o padrão da sessão.'),
  signatureName: SignatureNameSchema.min(1)
    .optional()
    .describe('Nome da assinatura somente neste envio; omitido usa o nome da sessão.'),
})
export type TextSignature = z.infer<typeof TextSignatureSchema>

const SessionConfigSchema = z.object({
  messageOnCall: z.string(),
  rejectCalls: z.boolean(),
  ignoreGroups: z.boolean(),
  syncFullHistory: z.boolean(),
  markOnlineOnConnect: z.boolean(),
  clientConnectionName: z.string(),
  signatureEnabled: z.boolean(),
  signatureName: SignatureNameSchema,
})

export const CreateSessionConfigSchema = z.object({
  signatureEnabled: SessionConfigSchema.shape.signatureEnabled.default(false),
  signatureName: SessionConfigSchema.shape.signatureName.default(''),
  messageOnCall: SessionConfigSchema.shape.messageOnCall.optional(),
  rejectCalls: SessionConfigSchema.shape.rejectCalls.optional().default(false),
  ignoreGroups: SessionConfigSchema.shape.ignoreGroups.optional().default(false),
  syncFullHistory: SessionConfigSchema.shape.syncFullHistory.optional().default(false),
  markOnlineOnConnect: SessionConfigSchema.shape.markOnlineOnConnect.optional().default(false),
  clientConnectionName: SessionConfigSchema.shape.clientConnectionName
    .optional()
    .default(DEFAULT_CLIENT_CONN_NAME),
})
export type CreateWASessionConfig = z.infer<typeof CreateSessionConfigSchema>

export const UpdateSessionConfigSchema = z.object({
  signatureEnabled: SessionConfigSchema.shape.signatureEnabled.optional(),
  signatureName: SessionConfigSchema.shape.signatureName.optional(),
  messageOnCall: SessionConfigSchema.shape.messageOnCall.optional(),
  rejectCalls: SessionConfigSchema.shape.rejectCalls.optional(),
  ignoreGroups: SessionConfigSchema.shape.ignoreGroups.optional(),
  syncFullHistory: SessionConfigSchema.shape.syncFullHistory.optional(),
  markOnlineOnConnect: SessionConfigSchema.shape.markOnlineOnConnect.optional(),
  clientConnectionName: SessionConfigSchema.shape.clientConnectionName.optional(),
})
export type UpdateWASessionConfig = z.infer<typeof UpdateSessionConfigSchema>

export const CreateWASessionBodySchema = z.object({
  enabled: z.boolean().optional().default(true),
  displayName: z.string().optional(),
  config: CreateSessionConfigSchema,
})
export type CreateWASessionBody = z.infer<typeof CreateWASessionBodySchema>

export const UpdateWASessionBodySchema = z.object({
  enabled: z.boolean().optional(),
  displayName: z.string().optional(),
  config: UpdateSessionConfigSchema.optional(),
})
export type UpdateWASessionBody = z.infer<typeof UpdateWASessionBodySchema>

export const WebhookEventsSchema = z.object({
  // Baileys Events
  call: z.boolean().optional().default(false),
  'blocklist.set': z.boolean().optional().default(false),
  'blocklist.update': z.boolean().optional().default(false),
  'chats.delete': z.boolean().optional().default(false),
  'chats.phoneNumberShare': z.boolean().optional().default(false),
  'chats.update': z.boolean().optional().default(false),
  'chats.upsert': z.boolean().optional().default(false),
  'connection.update': z.boolean().optional().default(false),
  'contacts.update': z.boolean().optional().default(false),
  'contacts.upsert': z.boolean().optional().default(false),
  'group-participants.update': z.boolean().optional().default(false),
  'group.join-request': z.boolean().optional().default(false),
  'groups.update': z.boolean().optional().default(false),
  'groups.upsert': z.boolean().optional().default(false),
  'labels.association': z.boolean().optional().default(false),
  'labels.edit': z.boolean().optional().default(false),
  'message-receipt.update': z.boolean().optional().default(false),
  'messages.delete': z.boolean().optional().default(false),
  'messages.media-update': z.boolean().optional().default(false),
  'messages.reaction': z.boolean().optional().default(false),
  'messages.send': z.boolean().optional().default(false),
  'messages.update': z.boolean().optional().default(false),
  // 'messages.upsert': z.boolean().optional().default(false),
  'messaging-history.set': z.boolean().optional().default(false),
  'presence.update': z.boolean().optional().default(false),
  // Custom Events
  'inbound-message.upsert': z.boolean().optional().default(false),
  'outbound-message.upsert': z.boolean().optional().default(false),
})

export type WebhookEvents = z.infer<typeof WebhookEventsSchema>

export const CreateWebhookBodySchema = z.object({
  url: OutboundUrlSchema,
  displayName: z.string().optional(),
  events: WebhookEventsSchema,
  enabled: z.boolean().optional().default(false),
  headers: z.record(z.string(), z.string()).optional().default({}),
})

export const UpdateWebhookBodySchema = z.object({
  url: OutboundUrlSchema.optional(),
  displayName: z.string().optional(),
  enabled: z.boolean().optional(),
  events: WebhookEventsSchema.optional(),
  headers: z.record(z.string(), z.string()).optional(),
})

export const MediaSchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'document']),
  source: MediaSourceSchema,
  fileName: z.string().optional(),
  gifPlayback: z.boolean().optional().default(false),
})

const BaseMessageSchema = z.object({
  number: z.string(),
  mentions: z.array(z.string().max(128)).max(100).optional(),
  quoted: z.string().optional(),
  delay: z.number().int().min(0).max(10000).optional(),
})

export const TextMessageSchema = z.object({
  ...TextSignatureSchema.shape,
  ...BaseMessageSchema.shape,
  message: z.string(),
  linkPreview: z.boolean().optional().default(true),
})
export type TextMessage = z.infer<typeof TextMessageSchema>

export const MediaMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  caption: z.string().optional(),
  media: MediaSchema,
})
export type MediaMessage = z.infer<typeof MediaMessageSchema>

export const ImageMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  source: MediaSourceSchema,
  fileName: z.string().optional(),
  caption: z.string().optional(),
})
export type ImageMessage = z.infer<typeof ImageMessageSchema>

export const VideoMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  source: MediaSourceSchema,
  fileName: z.string().optional(),
  caption: z.string().optional(),
  gifPlayback: z.boolean().optional().default(false),
})
export type VideoMessage = z.infer<typeof VideoMessageSchema>

export const AudioMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  source: MediaSourceSchema,
  caption: z.string().optional(),
  asVoiceNote: z.boolean().optional().default(false),
})
export type AudioMessage = z.infer<typeof AudioMessageSchema>

export const DocumentMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  source: MediaSourceSchema,
  fileName: z.string().optional(),
  caption: z.string().optional(),
})
export type DocumentMessage = z.infer<typeof DocumentMessageSchema>

export const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z.string(),
  displayName: z.string().optional(),
  organization: z.string().optional(),
  url: z.string().optional(),
  email: z.string().optional(),
})
export type Contact = z.infer<typeof ContactSchema>

export const ContactMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  contact: ContactSchema,
})
export type ContactMessage = z.infer<typeof ContactMessageSchema>

export const LocationSchema = z.object({
  degreesLatitude: z.number().optional(),
  degreesLongitude: z.number().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  url: z.string().optional(),
  comment: z.string().optional(),
})

export const LocationMessageSchema = z.object({
  ...BaseMessageSchema.shape,
  location: LocationSchema,
})
export type LocationMessage = z.infer<typeof LocationMessageSchema>

export const CreateGroupBodySchema = z.object({
  subject: z.string(),
  description: z.string().optional(),
  participants: z.array(z.string()).default([]),
})
export type CreateGroupBody = z.infer<typeof CreateGroupBodySchema>

export const UpdateGroupBodySchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  onlyAdminsCanPost: z.boolean().optional(),
  onlyAdminsCanEditInfo: z.boolean().optional(),
})

// Should match baileys WAPrivacyValue
export const WAPrivacyValueSchema = z.enum(['contacts', 'all', 'contact_blacklist', 'none'])
export const UpdatePrivacyValueSchema = z.object({
  privacy: WAPrivacyValueSchema,
})
export type WAPrivacyValue = z.infer<typeof WAPrivacyValueSchema>

// Should match baileys WAPrivacyOnlineValue
export const WAPrivacyOnlineValueSchema = z.enum(['all', 'match_last_seen'])
export const UpdateOnlinePrivacyValueSchema = z.object({
  privacy: WAPrivacyOnlineValueSchema,
})
export type WAPrivacyOnlineValue = z.infer<typeof WAPrivacyOnlineValueSchema>

// Should match baileys WAReadReceiptsValue
export const WAReadReceiptsValueSchema = z.enum(['all', 'none'])
export const UpdateReadReceiptsPrivacyValueSchema = z.object({
  privacy: WAReadReceiptsValueSchema,
})
export type WAReadReceiptsValue = z.infer<typeof WAReadReceiptsValueSchema>

// Should match baileys WAPrivacyGroupAddValue
export const WAPrivacyGroupAddValueSchema = z.enum(['all', 'contacts', 'contact_blacklist'])
export const UpdateGroupsAddPrivacyValueSchema = z.object({
  privacy: WAPrivacyGroupAddValueSchema,
})
export type WAPrivacyGroupAddValue = z.infer<typeof WAPrivacyGroupAddValueSchema>

export const DefaultDisappearingMode = {
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
  THREE_MONTHS: 7776000,
  OFF: 0,
}

export const UpdateDefaultDisappearingModeSchema = z.object({
  mode: z.enum(['ONE_DAY', 'ONE_WEEK', 'THREE_MONTHS', 'OFF']),
})
