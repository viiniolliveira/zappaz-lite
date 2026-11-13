import z from 'zod'

export const SessionParamsSchema = z.object({
  sessionId: z.string(),
})

export const GroupParamsSchema = SessionParamsSchema.extend({
  jid: z.string(),
})

export const CreateGroupBodySchema = z.object({
  subject: z.string().describe('Nome do grupo.'),
  description: z.string().optional().describe('Descrição do grupo.'),
  participants: z
    .array(z.string())
    .default([])
    .describe('Números ou identificadores dos participantes.'),
})

export const UpdateGroupBodySchema = z.object({
  subject: z.string().optional().describe('Novo nome do grupo.'),
  description: z.string().optional().describe('Nova descrição do grupo.'),
  onlyAdminsCanPost: z
    .boolean()
    .optional()
    .describe('Restringe o envio de mensagens aos administradores.'),
  onlyAdminsCanEditInfo: z
    .boolean()
    .optional()
    .describe('Restringe a edição das informações aos administradores.'),
})

export const UpdateGroupParticipantsBodySchema = z
  .array(z.string())
  .min(1, 'No participants provided')
  .describe('Lista de números ou identificadores dos participantes.')

export const SendGroupInviteBodySchema = z.object({
  number: z.string().describe('Número ou identificador do destinatário do convite.'),
  message: z.string().optional().describe('Mensagem opcional que acompanha o convite.'),
})
