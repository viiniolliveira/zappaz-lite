import z from 'zod'
import { TextSignatureSchema } from '../../common/schema.ts'
import { MediaSourceSchema } from '../../lib/outbound-policy.ts'
import { MessageQuerySchema } from '../conversation-messages/schema.ts'

export const MessageFiltersSchema = z.object({
  conversationId: z.string().uuid().optional(),
  phoneNumber: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  lid: z
    .string()
    .regex(/^\d+@lid$/)
    .max(128)
    .optional(),
  jid: z
    .string()
    .regex(/^\d+@(s\.whatsapp\.net|lid)$/)
    .max(128)
    .optional(),
})
export const GetMessagesQuerySchema = MessageQuerySchema.safeExtend(MessageFiltersSchema.shape)
export const GetMessageQuerySchema = MessageFiltersSchema.refine(
  (query) => Object.values(query).some((value) => value !== undefined),
  'At least one conversation filter is required',
)
export const GetMessageParamsSchema = z.object({
  sessionId: z.string().min(1),
  messageId: z.string().min(1).max(128),
})

export { EditMessageSchema } from '../../../../shared/edit-message.ts'

export const SessionParamsSchema = z.object({
  sessionId: z.string(),
})

const BaseMessageSchema = z.object({
  number: z
    .string()
    .min(1)
    .max(128)
    .describe('Número ou identificador do destinatário no WhatsApp.'),
  mentions: z
    .array(z.string().max(128))
    .max(100)
    .optional()
    .describe('Identificadores mencionados na mensagem.'),
  quoted: z.string().max(128).optional().describe('Identificador da mensagem citada.'),
  delay: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .describe('Atraso antes do envio, em milissegundos.'),
})

export const MessageParamsSchema = SessionParamsSchema.extend({
  messageId: z.string(),
})

export const TextMessageSchema = BaseMessageSchema.extend({
  ...TextSignatureSchema.shape,
  message: z.string().min(1).max(65536).describe('Texto da mensagem.'),
  linkPreview: z.boolean().optional().default(true).describe('Habilita a prévia de links.'),
})

export const ImageMessageSchema = BaseMessageSchema.extend({
  source: MediaSourceSchema.describe('URL da mídia ou conteúdo do arquivo codificado em base64.'),
  fileName: z
    .string()
    .max(255)
    .optional()
    .describe('Nome do arquivo, incluindo a extensão quando disponível.'),
  caption: z.string().max(4096).optional().describe('Legenda da mídia.'),
})

export const VideoMessageSchema = ImageMessageSchema.extend({
  gifPlayback: z.boolean().optional().default(false).describe('Reproduz o vídeo como GIF.'),
})

export const AudioMessageSchema = BaseMessageSchema.extend({
  source: MediaSourceSchema.describe('URL do áudio ou conteúdo do arquivo codificado em base64.'),
  caption: z.string().max(4096).optional().describe('Legenda do áudio.'),
  asVoiceNote: z.boolean().optional().default(false).describe('Envia o áudio como nota de voz.'),
})

export const DocumentMessageSchema = ImageMessageSchema

const ContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  phoneNumber: z.string(),
  displayName: z.string().optional(),
  organization: z.string().optional(),
  url: z.string().optional(),
  email: z.string().optional(),
})

export const ContactMessageSchema = BaseMessageSchema.extend({
  contact: ContactSchema,
})

const LocationSchema = z.object({
  degreesLatitude: z.number().optional(),
  degreesLongitude: z.number().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  url: z.string().optional(),
  comment: z.string().optional(),
})

export const LocationMessageSchema = BaseMessageSchema.extend({
  location: LocationSchema,
})
