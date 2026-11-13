import { logger } from '@lib/logger.ts'
import { McpServer } from '@modelcontextprotocol/server'
import { AppError } from '@server/common/errors/app-error.ts'
import { BadRequestError } from '@server/common/errors/bad-request-error.ts'
import { NotFoundError } from '@server/common/errors/not-found-error.ts'
import { UnauthorizedError } from '@server/common/errors/unauthorized-error.ts'
import { prisma } from '@server/db/prisma.ts'
import * as sessionSchemas from '@server/modules/sessions/schema.ts'
import * as sessions from '@server/modules/sessions/service.ts'
import * as webhookSchemas from '@server/modules/webhooks/schema.ts'
import * as webhooks from '@server/modules/webhooks/service.ts'
import * as actionSchemas from '@server/modules/whatsapp-actions/schema.ts'
import * as actions from '@server/modules/whatsapp-actions/service.ts'
import * as groupSchemas from '@server/modules/whatsapp-groups/schema.ts'
import * as groups from '@server/modules/whatsapp-groups/service.ts'
import { editWhatsappTextMessage } from '@server/modules/whatsapp-messages/edit-service.ts'
import * as messageSchemas from '@server/modules/whatsapp-messages/schema.ts'
import * as messages from '@server/modules/whatsapp-messages/service.ts'
import { whatsappService } from '@services/whatsapp.ts'
import { z } from 'zod'

import {
  EmptyToolSchema,
  GroupPictureSchema,
  GroupToolSchema,
  MessageToolSchema,
  WebhookLogsToolSchema,
  WebhookLogToolSchema,
  WebhooksPageSchema,
  WebhookToolSchema,
} from './schema.ts'
import type { McpContext } from './types.ts'

export function createMcpServer(context: McpContext) {
  const server = new McpServer({ name: 'zappaz-lite', version: '1.0.0' })

  function tool<T extends z.ZodObject>(
    name: string,
    description: string,
    inputSchema: T,
    action: (input: z.output<T>, sessionId: string) => unknown | Promise<unknown>,
    options: {
      connected?: boolean
      readOnly?: boolean
      destructive?: boolean
      sessionScoped?: boolean
    } = {},
  ) {
    const sessionScoped = options.sessionScoped !== false
    const schema: z.ZodObject =
      context.preset === 'user' && sessionScoped
        ? inputSchema
            .extend({ sessionId: z.string().trim().min(1).describe('ID da sessão WhatsApp.') })
            .strict()
        : inputSchema.strict()
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema,
        annotations: {
          readOnlyHint: options.readOnly ?? false,
          destructiveHint: options.destructive ?? !options.readOnly,
          openWorldHint: true,
        },
      },
      async (input) => {
        try {
          const sessionId = !sessionScoped
            ? ''
            : context.preset === 'session'
              ? context.sessionId
              : z.object({ sessionId: z.string().trim().min(1) }).parse(input).sessionId
          if (sessionScoped && context.preset === 'user') {
            const session = await prisma.waSession.findUnique({ where: { id: sessionId } })
            if (!session || (context.user.role !== 'ADMIN' && session.userId !== context.user.id))
              throw new UnauthorizedError('Access denied')
          }
          if (sessionScoped && options.connected !== false) {
            if (!whatsappService.isSessionEnabled(sessionId))
              throw new BadRequestError('Session not enabled')
            if (!whatsappService.isSessionConnected(sessionId))
              throw new BadRequestError('Session not connected')
          }
          const result = await action(inputSchema.parse(input), sessionId)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result ?? { status: 'success' }),
              },
            ],
          }
        } catch (error) {
          if (!(error instanceof AppError)) logger.error({ msg: 'MCP tool failed', tool: name })
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: error instanceof AppError ? error.message : 'Unable to complete operation',
              },
            ],
          }
        }
      },
    )
  }

  if (context.preset === 'user') {
    const { user } = context
    const sessionOperation = { connected: false }
    tool(
      'list_sessions',
      'Lista as sessões acessíveis ao usuário, com paginação.',
      sessionSchemas.GetSessionsQuerySchema,
      async (query) => {
        const result = await sessions.getSessions({ query, user })
        return result
      },
      { sessionScoped: false, readOnly: true },
    )
    tool(
      'create_session',
      'Cria uma sessão WhatsApp para o usuário.',
      z.object({ data: sessionSchemas.CreateSessionBodySchema }),
      ({ data }) => sessions.createSession(user, data),
      { sessionScoped: false },
    )
    tool(
      'get_session',
      'Consulta uma sessão WhatsApp.',
      EmptyToolSchema,
      (_, sessionId) => sessions.getSessionById(sessionId),
      { ...sessionOperation, readOnly: true },
    )
    tool(
      'update_session',
      'Atualiza uma sessão WhatsApp.',
      z.object({ data: sessionSchemas.UpdateSessionBodySchema }),
      ({ data }, sessionId) => sessions.updateSession(user, sessionId, data),
      sessionOperation,
    )
    tool(
      'delete_session',
      'Exclui permanentemente uma sessão WhatsApp.',
      EmptyToolSchema,
      (_, sessionId) => sessions.removeSession(sessionId),
      { ...sessionOperation, destructive: true },
    )
    tool(
      'connect_session',
      'Conecta uma sessão WhatsApp e retorna o QR code.',
      EmptyToolSchema,
      (_, sessionId) => {
        if (!whatsappService.isSessionEnabled(sessionId))
          throw new BadRequestError('Session not enabled')
        return sessions.connectSession(sessionId)
      },
      sessionOperation,
    )
    tool(
      'logout_session',
      'Desconecta uma sessão WhatsApp.',
      EmptyToolSchema,
      (_, sessionId) => {
        if (!whatsappService.isSessionEnabled(sessionId))
          throw new BadRequestError('Session not enabled')
        return sessions.logoutSession(sessionId)
      },
      sessionOperation,
    )
  }

  tool(
    'send_text_message',
    'Envia uma mensagem de texto para um destinatário ou grupo, com prévia de links opcional. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.TextMessageSchema }),
    ({ data }, sessionId) => messages.sendTextMessage(sessionId, data),
  )
  tool(
    'send_image_message',
    'Envia uma imagem para um destinatário ou grupo. Em data.source informe uma URL ou o conteúdo em base64; aceita legenda e nome de arquivo opcionais. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.ImageMessageSchema }),
    ({ data }, sessionId) => messages.sendImageMessage(sessionId, data),
  )
  tool(
    'send_video_message',
    'Envia um vídeo para um destinatário ou grupo. Em data.source informe uma URL ou o conteúdo em base64; aceita legenda, nome de arquivo e reprodução como GIF. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.VideoMessageSchema }),
    ({ data }, sessionId) => messages.sendVideoMessage(sessionId, data),
  )
  tool(
    'send_audio_message',
    'Envia um áudio para um destinatário ou grupo. Em data.source informe uma URL ou o conteúdo em base64; asVoiceNote permite enviá-lo como nota de voz. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.AudioMessageSchema }),
    ({ data }, sessionId) => messages.sendAudioMessage(sessionId, data),
  )
  tool(
    'send_document_message',
    'Envia um documento para um destinatário ou grupo. Em data.source informe uma URL ou o conteúdo em base64; aceita legenda e nome de arquivo opcionais. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.DocumentMessageSchema }),
    ({ data }, sessionId) => messages.sendDocumentMessage(sessionId, data),
  )
  tool(
    'send_contact_message',
    'Envia um cartão de contato para um destinatário ou grupo. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.ContactMessageSchema }),
    ({ data }, sessionId) => messages.sendContactMessage(sessionId, data),
  )
  tool(
    'send_location_message',
    'Envia uma localização para um destinatário ou grupo. Exige WhatsApp conectado.',
    z.object({ data: messageSchemas.LocationMessageSchema }),
    ({ data }, sessionId) => messages.sendLocationMessage(sessionId, data),
  )
  tool(
    'delete_message',
    'Apaga para todos a mensagem identificada por messageId. Exige WhatsApp conectado.',
    MessageToolSchema,
    ({ messageId }, sessionId) => messages.deleteMessageForEveryone(sessionId, messageId),
    { destructive: true },
  )
  tool(
    'edit_message',
    'Edita uma mensagem própria de texto ou resposta de texto pelo ID WhatsApp original, preservando a citação. Não edita mídias, legendas, templates interativos ou mensagens removidas. Exige sessão habilitada/conectada e respeita as restrições do WhatsApp. Não repita automaticamente em falhas.',
    MessageToolSchema.extend({ data: messageSchemas.EditMessageSchema }),
    ({ messageId, data }, sessionId) => editWhatsappTextMessage(sessionId, messageId, data),
    { destructive: true },
  )

  tool(
    'list_groups',
    'Lista os grupos da sessão sem participantes. Para consultá-los, use get_group_participants com o groupId. Exige WhatsApp conectado.',
    EmptyToolSchema,
    async (_, sessionId) =>
      (await groups.listGroups(sessionId)).map(
        ({ participants: _participants, ...group }) => group,
      ),
    { readOnly: true },
  )
  tool(
    'get_group_participants',
    'Lista os participantes do grupo identificado por groupId. Exige WhatsApp conectado.',
    GroupToolSchema,
    async ({ groupId }, sessionId) => {
      const group = (await groups.listGroups(sessionId)).find((group) => group.id === groupId)
      if (!group) throw new NotFoundError('Group not found')
      return group.participants
    },
    { readOnly: true },
  )
  tool(
    'create_group',
    'Cria um grupo com nome, descrição opcional e participantes. Exige WhatsApp conectado.',
    z.object({ data: groupSchemas.CreateGroupBodySchema }),
    ({ data }, sessionId) => groups.createGroup(sessionId, data),
  )
  tool(
    'update_group',
    'Atualiza nome, descrição e permissões de postagem ou edição das informações de um grupo. Exige WhatsApp conectado.',
    GroupToolSchema.extend({ data: groupSchemas.UpdateGroupBodySchema }),
    ({ groupId, data }, sessionId) => groups.updateGroup(sessionId, groupId, data),
  )
  for (const [name, action, description] of [
    [
      'add_participants',
      'add',
      'Adiciona participantes ao grupo informado. Exige WhatsApp conectado.',
    ],
    [
      'remove_participants',
      'remove',
      'Remove participantes do grupo informado. Exige WhatsApp conectado.',
    ],
    [
      'promote_participants',
      'promote',
      'Promove participantes do grupo informado a administradores. Exige WhatsApp conectado.',
    ],
    [
      'demote_participants',
      'demote',
      'Remove o papel de administrador dos participantes informados. Exige WhatsApp conectado.',
    ],
  ] as const) {
    tool(
      name,
      description,
      GroupToolSchema.extend({
        data: groupSchemas.UpdateGroupParticipantsBodySchema,
      }),
      ({ groupId, data }, sessionId) =>
        groups.updateGroupParticipants(sessionId, groupId, data, action),
      { destructive: action === 'remove' || action === 'demote' },
    )
  }
  tool(
    'send_group_invite_link',
    'Envia o link de convite do grupo para um número, com mensagem opcional. Exige WhatsApp conectado.',
    GroupToolSchema.extend({ data: groupSchemas.SendGroupInviteBodySchema }),
    ({ groupId, data }, sessionId) => groups.sendGroupInvite(sessionId, groupId, data),
  )
  tool(
    'update_group_picture',
    'Atualiza a imagem do grupo em data.identifier. Em data.source informe uma URL ou a imagem em base64. Exige WhatsApp conectado.',
    z.object({ data: GroupPictureSchema }),
    ({ data }, sessionId) => actions.updateDisplayPicture(sessionId, data),
  )

  tool(
    'get_display_picture',
    'Consulta a foto do perfil ou grupo em identifier. Exige WhatsApp conectado.',
    actionSchemas.GetDisplayPictureQuerySchema,
    (query, sessionId) => actions.getDisplayPicture(sessionId, query),
    { readOnly: true },
  )
  tool(
    'update_display_picture',
    'Atualiza a foto do perfil ou grupo em data.identifier. Em data.source informe uma URL ou imagem em base64. Exige WhatsApp conectado.',
    z.object({ data: actionSchemas.UpdateDisplayPictureBodySchema }),
    ({ data }, sessionId) => actions.updateDisplayPicture(sessionId, data),
  )
  tool(
    'update_profile_status',
    'Atualiza o recado do perfil WhatsApp da sessão com data.status. Exige WhatsApp conectado.',
    z.object({ data: actionSchemas.UpdateProfileStatusBodySchema }),
    ({ data }, sessionId) => actions.updateProfileStatus(sessionId, data),
  )
  tool(
    'update_profile_name',
    'Atualiza o nome do perfil WhatsApp da sessão com data.name. Exige WhatsApp conectado.',
    z.object({ data: actionSchemas.UpdateProfileNameBodySchema }),
    ({ data }, sessionId) => actions.updateProfileName(sessionId, data),
  )
  const contactSchema = actionSchemas.ContactParamsSchema.omit({ sessionId: true })
  tool(
    'is_on_whatsapp',
    'Verifica se o contato em jid possui WhatsApp. Exige WhatsApp conectado.',
    contactSchema,
    async ({ jid }, sessionId) => ({ isOnWhatsApp: await actions.isOnWhatsApp(sessionId, jid) }),
    { readOnly: true },
  )
  tool(
    'get_about',
    'Consulta o recado do perfil do contato em jid. Exige WhatsApp conectado.',
    contactSchema,
    ({ jid }, sessionId) => actions.getAbout(sessionId, jid),
    { readOnly: true },
  )
  tool(
    'block_contact',
    'Bloqueia o contato em jid no WhatsApp da sessão. Exige WhatsApp conectado.',
    contactSchema,
    ({ jid }, sessionId) => actions.blockContact(sessionId, jid),
    { destructive: true },
  )
  tool(
    'unblock_contact',
    'Desbloqueia o contato em jid no WhatsApp da sessão. Exige WhatsApp conectado.',
    contactSchema,
    ({ jid }, sessionId) => actions.unblockContact(sessionId, jid),
  )

  const offline = { connected: false }
  tool(
    'get_webhooks',
    'Lista os webhooks da sessão com paginação (page e pageSize). Funciona com WhatsApp desconectado.',
    WebhooksPageSchema,
    ({ page, pageSize }, sessionId) =>
      webhooks.getWebhooks(sessionId, {
        page: String(page),
        pageSize: String(pageSize),
      }),
    { ...offline, readOnly: true },
  )
  tool(
    'create_webhook',
    'Cria um webhook da sessão com URL, eventos e opções de configuração. Funciona com WhatsApp desconectado.',
    z.object({ data: webhookSchemas.CreateWebhookBodySchema }),
    ({ data }, sessionId) => webhooks.createWebhook(sessionId, data),
    offline,
  )
  tool(
    'get_webhook_logs',
    'Lista os logs de entrega do webhook da sessão, com paginação e filtros event, status, startDate e endDate. Funciona com WhatsApp desconectado.',
    WebhookLogsToolSchema,
    ({ webhookId, page, pageSize, ...filters }, sessionId) =>
      webhooks.getWebhookLogs(sessionId, webhookId, {
        ...filters,
        page: String(page),
        pageSize: String(pageSize),
      }),
    { ...offline, readOnly: true },
  )
  tool(
    'get_webhook_log',
    'Consulta um log de entrega do webhook da sessão, incluindo payload e resposta registrados. Funciona com WhatsApp desconectado.',
    WebhookLogToolSchema,
    ({ webhookId, logId }, sessionId) => webhooks.getWebhookLogById(sessionId, webhookId, logId),
    { ...offline, readOnly: true },
  )
  tool(
    'retry_webhook_log',
    'Reenvia o payload de um log de webhook ao destino registrado e retorna o novo log. Tem efeito externo real e pode duplicar o processamento no destinatário. Não exige WhatsApp conectado.',
    WebhookLogToolSchema,
    ({ webhookId, logId }, sessionId) => webhooks.retryWebhookLog({ sessionId, webhookId, logId }),
    { ...offline, destructive: true },
  )
  tool(
    'update_webhook',
    'Atualiza a configuração do webhook da sessão identificado por webhookId. Funciona com WhatsApp desconectado.',
    WebhookToolSchema.extend({ data: webhookSchemas.UpdateWebhookBodySchema }),
    ({ webhookId, data }, sessionId) => webhooks.updateWebhook(sessionId, webhookId, data),
    offline,
  )
  tool(
    'delete_webhook',
    'Remove o webhook da sessão identificado por webhookId. Funciona com WhatsApp desconectado.',
    WebhookToolSchema,
    ({ webhookId }, sessionId) => webhooks.removeWebhook(sessionId, webhookId),
    { ...offline, destructive: true },
  )
  return server
}
