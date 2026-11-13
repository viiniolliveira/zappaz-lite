import type z from 'zod'

import type {
  AudioMessageSchema,
  ContactMessageSchema,
  DocumentMessageSchema,
  GetMessagesQuerySchema,
  ImageMessageSchema,
  LocationMessageSchema,
  MessageFiltersSchema,
  MessageParamsSchema,
  SessionParamsSchema,
  TextMessageSchema,
  VideoMessageSchema,
} from './schema.ts'

export type SessionParams = z.infer<typeof SessionParamsSchema>
export type MessageFilters = z.infer<typeof MessageFiltersSchema>
export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>
export type MessageParams = z.infer<typeof MessageParamsSchema>
export type TextMessageInput = z.infer<typeof TextMessageSchema>
export type ImageMessageInput = z.infer<typeof ImageMessageSchema>
export type VideoMessageInput = z.infer<typeof VideoMessageSchema>
export type AudioMessageInput = z.infer<typeof AudioMessageSchema>
export type DocumentMessageInput = z.infer<typeof DocumentMessageSchema>
export type ContactMessageInput = z.infer<typeof ContactMessageSchema>
export type LocationMessageInput = z.infer<typeof LocationMessageSchema>
