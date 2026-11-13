import { z } from 'zod'

const id = z.uuid()
const date = z.iso.datetime()
const revision = z.number().int().positive()
const timestamps = { createdAt: date, updatedAt: date, revision }

export const messageTypeSchema = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'poll',
  'album',
  'group_invite',
  'system',
  'unavailable',
  'unknown',
])
export const messageStatusSchema = z.enum([
  'error',
  'pending',
  'sent',
  'delivered',
  'read',
  'played',
])
export const contactSchema = z.object({
  id,
  sessionId: id,
  jid: z.string(),
  phoneNumber: z.string().nullable(),
  lid: z.string().nullable().default(null),
  name: z.string().nullable(),
  pushName: z.string().nullable(),
  displayName: z.string(),
  localName: z.string().nullable().default(null),
  isSaved: z.boolean().default(false),
  email: z.string().nullable().default(null),
  annotations: z.string().nullable().default(null),
  avatarUrl: z.string().nullable(),
  avatarCheckedAt: z.string().datetime().nullable(),
  ...timestamps,
})
export const thumbnailSchema = z.object({
  mimeType: z.literal('image/jpeg'),
  base64: z.string().max(349528),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
})
export const mediaSchema = z.object({
  id,
  sessionId: id,
  conversationId: id,
  messageRecordId: id,
  kind: z.enum(['image', 'video', 'audio', 'document', 'sticker']),
  mimeType: z.string().nullable(),
  fileName: z.string().nullable(),
  size: z.number().nonnegative().nullable(),
  duration: z.number().nonnegative().nullable(),
  width: z.number().nonnegative().nullable(),
  height: z.number().nonnegative().nullable(),
  voice: z.boolean(),
  thumbnail: thumbnailSchema.nullable(),
  storageStatus: z.enum(['not_saved', 'pending', 'ready', 'failed']),
  contentPath: z.string(),
  ...timestamps,
})
export const sharedContactSchema = z.object({
  name: z.string().nullable(),
  vcard: z.string().nullable(),
  parsed: z
    .object({
      name: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      phones: z.array(
        z.object({ number: z.string(), waid: z.string().nullable(), types: z.array(z.string()) }),
      ),
      emails: z.array(z.string()),
      organization: z.string().nullable(),
    })
    .nullable(),
})
export const replySchema = z.object({
  messageRecordId: id.nullable(),
  messageId: z.string(),
  senderJid: z.string().nullable(),
  fromMe: z.boolean().nullable().optional(),
  type: messageTypeSchema,
  text: z.string().nullable(),
  contacts: z.array(sharedContactSchema),
  media: z
    .object({
      mimeType: z.string().nullable(),
      fileName: z.string().nullable(),
      thumbnail: thumbnailSchema.nullable().optional(),
    })
    .nullable(),
})
export const linkPreviewSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().max(512).nullable(),
  description: z.string().max(2048).nullable(),
  thumbnail: thumbnailSchema.nullable(),
})
export const pollSchema = z.object({
  name: z.string(),
  selectableOptionsCount: z.number().int().nonnegative(),
  options: z.array(
    z.object({ name: z.string(), hash: z.string(), votes: z.number().int().nonnegative() }),
  ),
  votes: z.array(
    z.object({
      voterId: z.string(),
      fromMe: z.boolean(),
      selectedOptions: z.array(z.string()),
      timestamp: date.nullable(),
    }),
  ),
})
export const messageSchema = z.object({
  id,
  sessionId: id,
  conversationId: id,
  messageId: z.string(),
  clientRequestId: id.nullable(),
  fromMe: z.boolean(),
  sender: z.object({ jid: z.string().nullable(), name: z.string().nullable() }),
  type: messageTypeSchema,
  text: z.string().nullable(),
  status: messageStatusSchema.nullable(),
  linkPreview: linkPreviewSchema.nullable(),
  hasLink: z.boolean(),
  interactive: z
    .object({
      title: z.string().nullable(),
      footer: z.string().nullable(),
      payment: z
        .object({
          referenceId: z.string().min(1),
          currency: z.string().regex(/^[A-Z]{3}$/),
          totalAmount: z.object({ value: z.int().nonnegative(), offset: z.int().positive() }),
          items: z.array(z.object({ name: z.string().min(1), quantity: z.int().positive() })),
          pixCode: z.string().min(1),
        })
        .optional(),
      buttons: z.array(
        z.object({
          kind: z.enum(['url', 'reply', 'unsupported']),
          text: z.string(),
          id: z.string().nullable(),
          url: z.url({ protocol: /^https?$/ }).nullable(),
        }),
      ),
      list: z
        .object({
          buttonText: z.string(),
          sections: z.array(
            z.object({
              title: z.string().nullable(),
              rows: z.array(
                z.object({
                  id: z.string().nullable(),
                  title: z.string(),
                  description: z.string().nullable(),
                }),
              ),
            }),
          ),
        })
        .optional(),
    })
    .nullable(),
  poll: pollSchema.nullable(),
  album: z
    .object({
      expectedImageCount: z.number().int().nonnegative(),
      expectedVideoCount: z.number().int().nonnegative(),
    })
    .nullable(),
  groupInvite: z
    .object({
      groupJid: z.string().nullable(),
      name: z.string(),
      expiresAt: date.nullable(),
      url: z.url({ protocol: /^https?$/ }).nullable(),
      thumbnail: thumbnailSchema.nullable(),
    })
    .nullable(),
  system: z
    .object({
      kind: z.enum(['disappearing_mode', 'block_contact']),
      duration: z.number().int().nonnegative().nullable(),
      blocked: z.boolean().nullable(),
    })
    .nullable(),
  unavailable: z.object({ reason: z.enum(['missing_content', 'linked_device']) }).nullable(),
  selection: z.object({ kind: z.enum(['button', 'list']), id: z.string().nullable() }).nullable(),
  sentAt: date.nullable(),
  orderAt: date,
  ...timestamps,
  editedAt: date.nullable(),
  deletedAt: date.nullable(),
  media: mediaSchema.nullable(),
  replyTo: replySchema.nullable(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      name: z.string().nullable(),
      address: z.string().nullable(),
      url: z.string().nullable().optional(),
      thumbnail: thumbnailSchema.nullable(),
    })
    .nullable(),
  contacts: z.array(sharedContactSchema),
  mentions: z.array(z.string()),
  reactions: z.array(
    z.object({
      senderJid: z.string(),
      fromMe: z.boolean(),
      emoji: z.string(),
      timestamp: date.nullable(),
    }),
  ),
})
export const conversationSchema = z.object({
  labelIds: z.array(z.uuid()),
  id,
  sessionId: id,
  jid: z.string(),
  contactId: id.nullable(),
  contact: contactSchema.nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isGroup: z.literal(false),
  lastMessage: messageSchema.nullable(),
  lastActivityAt: date.nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastReadMessageRecordId: id.nullable(),
  ...timestamps,
})
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    status: z.literal('success'),
    data: z.array(item),
    page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
  })
export const messagePageSchema = pageSchema(messageSchema).extend({
  boundaries: z.object({ first: z.string().nullable(), last: z.string().nullable() }),
})
export const mediaPageSchema = pageSchema(mediaSchema.extend({ message: messageSchema })).extend({
  count: z.number().int().nonnegative(),
})
export const libraryEntrySchema = z.object({
  message: messageSchema,
  conversation: z.object({
    id,
    sessionId: id,
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
})
export const libraryPageSchema = pageSchema(libraryEntrySchema).extend({
  count: z.number().int().nonnegative(),
})
export type LibraryEntry = z.infer<typeof libraryEntrySchema>
export type LibraryKind = 'media' | 'document' | 'link'
export const successSchema = <T extends z.ZodType>(item: T) =>
  z.object({ status: z.literal('success'), data: item })
export const chatEventSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    version: z.literal(1),
    eventId: id,
    occurredAt: date,
    sessionId: id,
    data,
  })
export const subscribeAckSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.object({ sessionId: id, subscribed: z.boolean() }) }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
])

export type ContactDTO = z.infer<typeof contactSchema>
export type ConversationDTO = z.infer<typeof conversationSchema>
export type MessageDTO = z.infer<typeof messageSchema>
export type MediaDTO = z.infer<typeof mediaSchema>
export type ReplyDTO = z.infer<typeof replySchema>
export type MessageType = z.infer<typeof messageTypeSchema>
export type MessageStatus = z.infer<typeof messageStatusSchema>
export type MessagePage = z.infer<typeof messagePageSchema>
export type SubscribeAck = z.infer<typeof subscribeAckSchema>
export const historySyncProgressSchema = z.object({
  errorId: z.uuid().optional(),
  phase: z.enum(['saving', 'waiting', 'complete', 'error']),
  messages: z.number().int().nonnegative(),
  contacts: z.number().int().nonnegative(),
  conversations: z.number().int().nonnegative(),
})
