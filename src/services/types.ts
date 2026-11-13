import type { z } from 'zod'
import type { webhookLogSchema } from '@/lib/realtime-schemas'

export type Role = 'ADMIN' | 'USER'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
  createdAt: string
  phone: string | null
}

export interface LoginResponse {
  user: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface CreateUserRequest {
  email: string
  firstName: string
  lastName: string
  phone?: string | null
  password: string
}

export interface UpdateUserRequest {
  email?: string
  firstName?: string
  lastName?: string
  phone?: string | null
  password?: string
  role?: Role
}

export type UpdateProfileRequest = Pick<UpdateUserRequest, 'email' | 'firstName' | 'lastName'> & {
  phone?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  password: string
}

export interface GetUsersParams {
  role?: Role
  page?: number
  pageSize?: number
}

export interface CreateUserResponse {
  user: User
}

// --- Session Types ---

export interface ConfigSessionSchema {
  signatureEnabled: boolean
  signatureName: string
  syncFullHistory: boolean
  messageOnCall: string
  rejectCalls: boolean
  ignoreGroups: boolean
  markOnlineOnConnect: boolean
}

export interface SessionSchema {
  id: string
  displayName: string
  status: string
  jid: string
  profilePictureUrl: string
  enabled: boolean
  archived: boolean
  userId: string
  config: ConfigSessionSchema
  qrCodeBase64?: string | null
}

export interface CreateSessionRequest {
  displayName: string
  config: ConfigSessionSchema
}

export interface UpdateSessionRequest {
  displayName?: string
  config?: Partial<ConfigSessionSchema>
}

// --- Webhook Types ---

export interface PaginatedResponse<T> {
  status: string
  data: T[]
  page: string | number
  pageSize: string | number
  total: string | number
}

export interface CreateWebhookRequest {
  url: string
  enabled: boolean
  displayName: string
  headers?: Record<string, string>
  secret?: string | null
  events?: string[]
}

export interface UpdateWebhookRequest {
  url?: string
  enabled?: boolean
  displayName?: string
  headers?: Record<string, string>
  secret?: string | null
  events?: string[]
}

export interface RetryWebhookEventProps {
  token: string | undefined
  sessionId: string
  webhookId: string
  logId: string
}

// --- Message Types ---

export type TestMessageType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'document'
  | 'contact'
  | 'location'

export interface SendTestMessageRequest {
  number: string
  type: TestMessageType
}

export interface SendTextMessageRequest {
  signMessage?: boolean
  signatureName?: string
  number: string
  message: string
  linkPreview?: boolean
  delay?: number
}

export interface SendAudioMessageRequest {
  number: string
  source: string
  asVoiceNote?: boolean
  delay?: number
}

export interface SendImageMessageRequest {
  number: string
  source: string
  caption?: string
}

export interface SendVideoMessageRequest {
  number: string
  source: string
  caption?: string
  gifPlayback?: boolean
}

export interface SendDocumentMessageRequest {
  number: string
  source: string
  caption?: string
  fileName?: string
}

export interface SendContactMessageRequest {
  number: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
}

export type SendLocationMessageRequest = {
  number: string
  degreesLatitude?: number
  degreesLongitude?: number
  name?: string
  address?: string
  url?: string
  comment?: string
}

export interface SendMessageHistoryItem {
  id: string
  sessionId: string
  createdAt: string
  updatedAt: string
  recipientJid: string
  type: string
}

export interface SendMessageHistoryResponse {
  total: number
  data: Record<string, SendMessageHistoryItem[]>
}

export interface Response {
  data: object | string
  status: number
  headers: object
}

export type WebhookLog = z.infer<typeof webhookLogSchema>

export interface WebhookEvents {
  call: boolean
  'labels.edit': boolean
  'chats.delete': boolean
  'chats.update': boolean
  'chats.upsert': boolean
  'blocklist.set': boolean
  'groups.update': boolean
  'groups.upsert': boolean
  'messages.send': boolean
  'contacts.update': boolean
  'contacts.upsert': boolean
  'messages.delete': boolean
  'messages.update': boolean
  'presence.update': boolean
  'blocklist.update': boolean
  'connection.update': boolean
  'messages.reaction': boolean
  'group.join-request': boolean
  'labels.association': boolean
  'messages.media-update': boolean
  'messaging-history.set': boolean
  'chats.phoneNumberShare': boolean
  'inbound-message.upsert': boolean
  'message-receipt.update': boolean
  'outbound-message.upsert': boolean
  'group-participants.update': boolean
}

export interface Webhook {
  id: string
  url: string
  enabled: boolean
  createdAt: string
  events: WebhookEvents
  waSessionId: string
  headers: Record<string, string>
  secret: string | null
  displayName: string
}

export interface ConnectSession {
  qrCodeBase64: string
}
