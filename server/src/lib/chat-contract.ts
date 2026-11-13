import { z } from 'zod'

export const MessageTypeSchema = z.enum([
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
export const MessageStatusSchema = z.enum([
  'error',
  'pending',
  'sent',
  'delivered',
  'read',
  'played',
])
const identity = {
  id: z.string().uuid(),
  sessionId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  revision: z.number().int().positive(),
}
export const ContactSchema = z.object({
  ...identity,
  jid: z.string(),
  phoneNumber: z.string().nullable(),
  lid: z.string().nullable().default(null),
  name: z.string().nullable(),
  localName: z.string().nullable().default(null),
  isSaved: z.boolean().default(false),
  email: z.string().nullable().default(null),
  annotations: z.string().nullable().default(null),
  pushName: z.string().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  avatarCheckedAt: z.string().datetime().nullable(),
})
export const MediaSchema = z.object({
  ...identity,
  conversationId: z.string().uuid(),
  messageRecordId: z.string().uuid(),
  kind: z.enum(['image', 'video', 'audio', 'document', 'sticker']),
  mimeType: z.string().nullable(),
  fileName: z.string().nullable(),
  size: z.number().nonnegative().nullable(),
  duration: z.number().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  voice: z.boolean(),
  thumbnail: z
    .object({
      mimeType: z.literal('image/jpeg'),
      base64: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    })
    .nullable(),
  storageStatus: z.enum(['not_saved', 'pending', 'ready', 'failed']),
  contentPath: z.string(),
})
export const LinkPreviewSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  title: z.string().max(512).nullable(),
  description: z.string().max(2048).nullable(),
  thumbnail: MediaSchema.shape.thumbnail,
})
export const SharedContactSchema = z.object({
  name: z.string().nullable(),
  vcard: z.string().nullable(),
  parsed: z
    .object({
      name: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      phones: z.array(
        z.object({
          number: z.string(),
          waid: z.string().nullable(),
          types: z.array(z.string()),
        }),
      ),
      emails: z.array(z.string()),
      organization: z.string().nullable(),
    })
    .nullable(),
})
export const InteractiveMessageSchema = z.object({
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
export type InteractiveMessage = z.infer<typeof InteractiveMessageSchema>

export const PollVoteSchema = z.object({
  voterId: z.string(),
  fromMe: z.boolean(),
  selectedOptions: z.array(z.string()),
  timestamp: z.string().datetime().nullable(),
})
export const PollSchema = z.object({
  name: z.string(),
  selectableOptionsCount: z.number().int().nonnegative(),
  options: z.array(
    z.object({ name: z.string(), hash: z.string(), votes: z.number().int().nonnegative() }),
  ),
  votes: z.array(PollVoteSchema),
})
export const AlbumSchema = z.object({
  expectedImageCount: z.number().int().nonnegative(),
  expectedVideoCount: z.number().int().nonnegative(),
})
export const GroupInviteSchema = z.object({
  groupJid: z.string().nullable(),
  name: z.string(),
  expiresAt: z.string().datetime().nullable(),
  url: z.url({ protocol: /^https?$/ }).nullable(),
  thumbnail: MediaSchema.shape.thumbnail,
})
export const SystemMessageSchema = z.object({
  kind: z.enum(['disappearing_mode', 'block_contact']),
  duration: z.number().int().nonnegative().nullable(),
  blocked: z.boolean().nullable(),
})
export const UnavailableMessageSchema = z.object({
  reason: z.enum(['missing_content', 'linked_device']),
})
export const SelectionSchema = z.object({
  kind: z.enum(['button', 'list']),
  id: z.string().nullable(),
})

export const MessageSchema = z.object({
  ...identity,
  conversationId: z.string().uuid(),
  messageId: z.string(),
  clientRequestId: z.string().nullable(),
  fromMe: z.boolean(),
  sender: z.object({ jid: z.string().nullable(), name: z.string().nullable() }),
  type: MessageTypeSchema,
  text: z.string().nullable(),
  linkPreview: LinkPreviewSchema.nullable(),
  hasLink: z.boolean(),
  interactive: InteractiveMessageSchema.nullable(),
  poll: PollSchema.nullable(),
  album: AlbumSchema.nullable(),
  groupInvite: GroupInviteSchema.nullable(),
  system: SystemMessageSchema.nullable(),
  unavailable: UnavailableMessageSchema.nullable(),
  selection: SelectionSchema.nullable(),
  status: MessageStatusSchema.nullable(),
  sentAt: z.string().datetime().nullable(),
  orderAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  media: MediaSchema.nullable(),
  replyTo: z
    .object({
      messageRecordId: z.string().nullable(),
      messageId: z.string(),
      senderJid: z.string().nullable(),
      fromMe: z.boolean().nullable().optional(),
      type: MessageTypeSchema,
      text: z.string().nullable(),
      contacts: z.array(SharedContactSchema),
      media: z
        .object({
          mimeType: z.string().nullable(),
          fileName: z.string().nullable(),
          thumbnail: MediaSchema.shape.thumbnail.optional(),
        })
        .nullable(),
    })
    .nullable(),
  location: z
    .object({
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      name: z.string().nullable(),
      address: z.string().nullable(),
      url: z.string().nullable().default(null),
      thumbnail: MediaSchema.shape.thumbnail,
    })
    .nullable(),
  contacts: z.array(SharedContactSchema),
  mentions: z.array(z.string()),
  reactions: z.array(
    z.object({
      senderJid: z.string(),
      fromMe: z.boolean(),
      emoji: z.string(),
      timestamp: z.string().datetime().nullable(),
    }),
  ),
})
export const ConversationSchema = z.object({
  labelIds: z.array(z.uuid()),
  ...identity,
  jid: z.string(),
  contactId: z.string().nullable(),
  contact: ContactSchema.nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  isGroup: z.literal(false),
  lastMessage: MessageSchema.nullable(),
  lastActivityAt: z.string().datetime().nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastReadMessageRecordId: z.string().nullable(),
})
export const LibraryEntrySchema = z.object({
  message: MessageSchema,
  conversation: z.object({
    id: z.uuid(),
    sessionId: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
})
export type ContactDTO = z.infer<typeof ContactSchema>
export type MediaDTO = z.infer<typeof MediaSchema>
export type MessageDTO = z.infer<typeof MessageSchema>
export type ConversationDTO = z.infer<typeof ConversationSchema>
