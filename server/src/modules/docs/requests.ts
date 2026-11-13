import { z } from 'zod'
import { config } from '../../config.ts'
import { LibraryQuerySchema } from '../chat-library/schema.ts'
import { ContactQuerySchema, SaveContactSchema, UpdateContactSchema } from '../contacts/schema.ts'
import * as labels from '../conversation-labels/schema.ts'
import * as chat from '../conversation-messages/schema.ts'
import * as conversations from '../conversations/schema.ts'
import * as globalWebhooks from '../global-webhooks/schema.ts'
import { SaveQuickMessageSchema } from '../quick-messages/schema.ts'
import * as history from '../send-message-history/schema.ts'
import * as sessions from '../sessions/schema.ts'
import * as webhooks from '../webhooks/schema.ts'
import * as actions from '../whatsapp-actions/schema.ts'
import * as groups from '../whatsapp-groups/schema.ts'
import * as messages from '../whatsapp-messages/schema.ts'
import * as privacy from '../whatsapp-privacy/schema.ts'

type RequestDetails = {
  body?: z.ZodType
  example?: unknown
  query?: z.ZodObject
  queryExample?: Record<string, string>
  pagination?: 'offset' | 'cursor' | 'messages'
  multipart?: boolean
  successStatuses?: readonly (200 | 201)[]
  notes?: string
}

const id = '00000000-0000-4000-8000-000000000001'
const number = '5511999999999'
const webhook = {
  url: 'https://example.com/webhook',
  enabled: true,
  events: { 'inbound-message.upsert': true },
  secret: 'SUBSTITUA_O_SEGREDO',
}
const registry: Record<string, RequestDetails> = {
  'GET /session/:sessionId/messages': {
    query: messages.GetMessagesQuerySchema,
    queryExample: { phoneNumber: number, limit: '50' },
    pagination: 'messages',
    notes:
      'Filtros opcionais conversationId (UUID), phoneNumber (dígitos com DDI), lid (JID @lid) e jid (JID PN/LID). Filtros combinados usam AND e resolvem a identidade persistida. Sem filtro lista a sessão. Resposta {status:"success",data:MessageDTO[],page:{hasMore,nextCursor},boundaries:{first,last}}. Cursores vinculados à sessão e filtros. Não inclui grupos.',
  },
  'GET /session/:sessionId/messages/:messageId': {
    query: messages.GetMessageQuerySchema,
    queryExample: { jid: `${number}@s.whatsapp.net` },
    notes:
      'messageId é o ID WhatsApp, não UUID interno. Exige ao menos um filtro: conversationId, phoneNumber, lid ou jid; filtros combinados usam AND. Retorna {status:"success",data:MessageDTO} no escopo da sessão, sem grupos. 404 se não encontrada; parâmetros inválidos seguem o erro de validação padrão.',
  },
  'PATCH /session/:sessionId/message/:messageId': {
    body: messages.EditMessageSchema,
    example: { text: 'Olá! Texto atualizado.' },
    notes:
      'Usa o ID WhatsApp, não o UUID interno. Exige sessão habilitada/conectada. Somente textos próprios e respostas de texto; preserva citação e horário, sem reaplicar assinatura. Retorna {status:"success",data:MessageDTO} com editedAt. 400: texto inválido; 403: mensagem recebida; 404: não encontrada na sessão; 409: mensagem não editável, sessão indisponível ou ID ambíguo; 502: resultado não confirmado. Não repita automaticamente em falhas. Restrições de edição do WhatsApp continuam aplicáveis.',
  },
  'PATCH /session/:sessionId/conversations/:conversationId/messages/:messageRecordId': {
    body: chat.EditMessageSchema,
    example: { text: 'Olá! Texto atualizado.' },
    notes:
      'Usa o UUID interno, limitado à sessão e conversa. Exige sessão habilitada/conectada. Somente textos próprios e respostas de texto; preserva citação e horário, sem reaplicar assinatura. Retorna {status:"success",data:MessageDTO} com editedAt. Não aceita legendas, mídias, templates interativos ou mensagens removidas. Restrições de edição do WhatsApp continuam aplicáveis; não repita automaticamente em falhas.',
  },
  'POST /session/:sessionId/quick-messages': {
    body: SaveQuickMessageSchema,
    example: { name: 'Boas-vindas', command: 'ola', message: 'Olá! Como podemos ajudar?' },
    successStatuses: [201],
    notes:
      'Comando sem /, normalizado para minúsculas e único por sessão. Mensagem de até 4096 caracteres. Retorna o registro salvo.',
  },
  'PATCH /session/:sessionId/quick-messages/:quickMessageId': {
    body: SaveQuickMessageSchema,
    example: { name: 'Boas-vindas', command: 'ola', message: 'Olá! Como podemos ajudar?' },
    notes:
      'Envie nome, comando e mensagem completos. Retorna 404 para um ID de outra sessão e 409 para comando duplicado.',
  },
  'GET /admin/webhook': {
    notes:
      'Retorna um array de webhooks globais, sem paginação. Cada webhook habilitado recebe os eventos selecionados de todas as sessões.',
  },
  'POST /admin/webhook': {
    body: globalWebhooks.CreateGlobalWebhookBodySchema,
    example: webhook,
    successStatuses: [201],
    notes:
      'Exige sessão Better Auth de administrador. Sem enabled, o webhook é criado desabilitado (false). Eventos omitidos recebem false. Não recebe sessionId.',
  },
  'PUT /admin/webhook/:webhookId': {
    body: globalWebhooks.UpdateGlobalWebhookBodySchema,
    example: { enabled: false },
    notes:
      'Ao enviar events, eventos omitidos recebem false; envie a configuração completa pretendida. A atualização recarrega os webhooks globais ativos.',
  },
  'POST /session/:sessionId/contacts': {
    body: SaveContactSchema,
    example: { name: 'Maria', phoneNumber: number, email: 'maria@example.com' },
    successStatuses: [201],
    notes: 'Salva apenas na agenda do Zappaz, nunca na agenda do WhatsApp.',
  },
  'PUT /session/:sessionId/contacts/:contactId': {
    body: UpdateContactSchema,
    example: { name: 'Maria', annotations: 'Cliente' },
  },
  'PATCH /session/:sessionId/contacts/:contactId': {
    body: UpdateContactSchema,
    example: { name: 'Maria', annotations: 'Cliente' },
  },
  'GET /session': {
    query: sessions.GetSessionsQuerySchema,
    queryExample: { page: '1', pageSize: '20', archived: 'false' },
    pagination: 'offset',
  },
  'POST /session': {
    body: sessions.CreateSessionBodySchema,
    example: {
      displayName: 'Atendimento',
      enabled: true,
      config: {
        rejectCalls: false,
        ignoreGroups: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        clientConnectionName: 'ZappaZ',
      },
    },
    notes:
      'config é obrigatório, mas aceita {} com os defaults do schema. Sessões criadas por usuário comum iniciam habilitadas; somente administradores podem criar sessões desabilitadas.',
  },
  'PUT /session/:sessionId': {
    body: sessions.UpdateSessionBodySchema,
    notes:
      'Exige login do proprietário ou de administrador. Usuários comuns podem editar nome e configurações, mas não enviar enabled. Arquivar e desarquivar sessões são ações exclusivas de administradores.',
    example: {
      displayName: 'Comercial',
      config: {
        rejectCalls: true,
        messageOnCall: 'Envie uma mensagem, por favor.',
      },
    },
  },
  'GET /session/:sessionId/contacts': {
    query: ContactQuerySchema,
    queryExample: { limit: '50', q: 'Maria' },
    pagination: 'cursor',
  },
  'GET /session/:sessionId/conversations': {
    query: conversations.ConversationQuerySchema,
    queryExample: { limit: '50', q: 'Maria' },
    pagination: 'cursor',
    notes:
      'labelId aceita uma única etiqueta da sessão; combina com q e filtra antes da paginação. A agenda de contatos não recebe etiquetas.',
  },
  'POST /session/:sessionId/conversation-labels': {
    body: labels.SaveLabelSchema,
    example: { name: 'Aguardando pagamento', description: '', color: '#14b8a6' },
    successStatuses: [201],
  },
  'PATCH /session/:sessionId/conversation-labels/:labelId': {
    body: labels.SaveLabelSchema,
    example: { name: 'Importante', description: 'Priorizar retorno', color: '#ec4899' },
  },
  'PUT /session/:sessionId/conversations/:conversationId/labels': {
    body: labels.ConversationLabelsSchema,
    example: { labelIds: [id] },
    notes:
      'Substitui a seleção completa em transação. [] remove todas. Valida conversa privada e etiquetas na mesma sessão. Retorna ConversationDTO com labelIds; não salva o contato na agenda.',
  },
  'POST /session/:sessionId/conversations': {
    successStatuses: [200, 201],
    body: conversations.CreateConversationSchema,
    example: { contactId: id },
    notes: 'Retorna 201 ao criar ou 200 se já existir uma conversa para o contato na sessão.',
  },
  'POST /session/:sessionId/conversations/:conversationId/read': {
    body: conversations.ReadConversationSchema,
    example: { lastReadMessageRecordId: id },
    notes: 'Use o UUID interno da última mensagem lida, não o ID WhatsApp.',
  },
  'PATCH /session/:sessionId/conversations/:conversationId/read-state': {
    body: conversations.ConversationReadStateSchema,
    example: { read: false },
    notes: 'Somente no Zappaz. Não envia recibos nem modifica o chat no WhatsApp.',
  },
  'GET /session/:sessionId/conversations/:conversationId/messages': {
    query: chat.MessageQuerySchema,
    queryExample: { limit: '50' },
    pagination: 'messages',
  },
  'GET /session/:sessionId/conversations/:conversationId/media': {
    query: chat.MediaQuerySchema,
    queryExample: { limit: '50', kind: 'image' },
    pagination: 'cursor',
  },
  'GET /session/:sessionId/library': {
    query: LibraryQuerySchema,
    queryExample: { kind: 'media', limit: '50' },
    pagination: 'cursor',
    notes:
      'Retorna {status,data:[{message,conversation}],count,page}. count é independente do cursor. Ordenação decrescente por orderAt e ID da mensagem; grupos e mensagens removidas não aparecem.',
  },
  'POST /session/:sessionId/conversations/:conversationId/messages/text': {
    successStatuses: [201],
    body: chat.SendTextSchema,
    example: { text: 'Olá!', clientRequestId: id },
    notes:
      'Texto de 1 a 4096 caracteres, não vazio após trim. clientRequestId é um UUID novo por envio lógico; reutilize-o ao repetir a mesma requisição. replyToMessageRecordId é um UUID interno opcional. Limite do body: 32 KiB. Resposta 201: {status:"success",data:MessageDTO}.',
  },
  'POST /session/:sessionId/conversations/:conversationId/messages/media': {
    successStatuses: [201],
    // z.file() represents the controller's File field as a binary OpenAPI upload.
    body: chat.SendMediaSchema.safeExtend({ file: z.file() }),
    example: {
      file: '/caminho/foto.jpg',
      kind: 'image',
      caption: 'Foto do produto',
      voice: 'false',
      clientRequestId: id,
    },
    multipart: true,
    notes: `file é um arquivo binário, não uma string JSON. Não defina Content-Type manualmente: o cliente gera o boundary multipart. voice aceita as strings true/false e só pode ser true para audio. Limite por arquivo: ${config.mediaMaxFileSizeMb} MiB; body multipart: ${config.mediaMaxFileSizeMb + 1} MiB. Resposta 201: {status:"success",data:MessageDTO}.`,
  },
  'POST /session/:sessionId/group': {
    body: groups.CreateGroupBodySchema,
    example: {
      subject: 'Equipe',
      description: 'Grupo comercial',
      participants: [number],
    },
  },
  'PUT /session/:sessionId/group/:jid': {
    body: groups.UpdateGroupBodySchema,
    example: {
      subject: 'Equipe comercial',
      onlyAdminsCanPost: true,
      onlyAdminsCanEditInfo: true,
    },
  },
  'POST /session/:sessionId/group/:jid/send-invite': {
    body: groups.SendGroupInviteBodySchema,
    example: { number, message: 'Entre no nosso grupo' },
  },
  'GET /session/:sessionId/display-picture': {
    query: actions.GetDisplayPictureQuerySchema,
    queryExample: { identifier: `${number}@s.whatsapp.net` },
  },
  'PUT /session/:sessionId/display-picture': {
    body: actions.UpdateDisplayPictureBodySchema,
    example: {
      identifier: `${number}@s.whatsapp.net`,
      source: 'https://example.com/avatar.jpg',
    },
  },
  'PUT /session/:sessionId/update-profile-name': {
    body: actions.UpdateProfileNameBodySchema,
    example: { name: 'Atendimento' },
  },
  'PUT /session/:sessionId/update-profile-status': {
    body: actions.UpdateProfileStatusBodySchema,
    example: { status: 'Disponível para atendimento' },
  },
  'GET /session/:sessionId/webhook': {
    query: webhooks.GetWebhooksQuerySchema,
    queryExample: { page: '1', pageSize: '20' },
    pagination: 'offset',
  },
  'POST /session/:sessionId/webhook': {
    successStatuses: [201],
    body: webhooks.CreateWebhookBodySchema,
    example: webhook,
    notes:
      'secret opcional é enviado em X-Zappaz-Webhook-Secret e retornado nas respostas autorizadas. Headers adicionais não podem sobrescrever esse nome.',
  },
  'PUT /session/:sessionId/webhook/:webhookId': {
    body: webhooks.UpdateWebhookBodySchema,
    example: { enabled: false },
    notes:
      'Ao enviar events, os eventos omitidos recebem false; envie a configuração completa pretendida. secret omitido preserva o valor atual, null remove e string substitui; a resposta retorna o segredo.',
  },
  'GET /session/:sessionId/webhook/:webhookId/logs': {
    query: webhooks.GetWebhookLogsQuerySchema,
    queryExample: {
      page: '1',
      pageSize: '20',
      event: 'inbound-message.upsert',
      status: '200',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-31T23:59:59.999Z',
    },
    pagination: 'offset',
    notes:
      'status filtra o código HTTP da resposta do destino. Datas ISO 8601, início <= fim; o filtro abrange os dias completos. Sem datas, o schema usa início de 30 dias atrás e fim do dia em que o módulo foi carregado.',
  },
  'GET /session/:sessionId/send-message-history': {
    query: history.GetSendMessageHistoryQuerySchema,
    queryExample: {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-31T23:59:59.999Z',
      granularity: 'day',
    },
    notes:
      'Agregação por day/week/month, sem paginação. Datas ISO 8601. Sem datas, os defaults são calculados quando o módulo é carregado.',
  },
}

for (const action of ['add', 'remove', 'promote', 'demote']) {
  registry[`POST /session/:sessionId/group/:jid/${action}`] = {
    body: groups.UpdateGroupParticipantsBodySchema,
    example: [number],
    notes: 'O body é um array JSON não vazio de participantes, não um objeto {participants:...}.',
  }
}
for (const [kind, schema, example] of [
  ['text', messages.TextMessageSchema, { number, message: 'Olá!', linkPreview: true }],
  [
    'image',
    messages.ImageMessageSchema,
    {
      number,
      source: 'https://example.com/foto.jpg',
      caption: 'Foto do produto',
      fileName: 'foto.jpg',
    },
  ],
  [
    'video',
    messages.VideoMessageSchema,
    {
      number,
      source: 'https://example.com/video.mp4',
      caption: 'Demonstração',
      gifPlayback: false,
    },
  ],
  [
    'audio',
    messages.AudioMessageSchema,
    { number, source: 'https://example.com/audio.ogg', asVoiceNote: true },
  ],
  [
    'document',
    messages.DocumentMessageSchema,
    {
      number,
      source: 'https://example.com/catalogo.pdf',
      fileName: 'catalogo.pdf',
      caption: 'Catálogo',
    },
  ],
  [
    'contact',
    messages.ContactMessageSchema,
    {
      number,
      contact: {
        firstName: 'Maria',
        lastName: 'Silva',
        phoneNumber: number,
        email: 'maria@example.com',
      },
    },
  ],
  [
    'location',
    messages.LocationMessageSchema,
    {
      number,
      location: {
        degreesLatitude: -23.5505,
        degreesLongitude: -46.6333,
        name: 'São Paulo',
        address: 'Centro',
      },
    },
  ],
] as const) {
  registry[`POST /session/:sessionId/message/${kind}`] = {
    body: schema,
    example,
    notes:
      'Campos comuns opcionais: mentions (array de identificadores), quoted (ID WhatsApp), delay (número). source é usado nas rotas de mídia. Não confunda estas rotas JSON com o upload multipart do chat. A sessão deve estar habilitada e conectada.',
  }
}
for (const [setting, schema, example] of [
  ['last-seen', privacy.UpdatePrivacyValueSchema, { privacy: 'contacts' }],
  ['profile-picture', privacy.UpdatePrivacyValueSchema, { privacy: 'contacts' }],
  ['status', privacy.UpdatePrivacyValueSchema, { privacy: 'contacts' }],
  ['online', privacy.UpdateOnlinePrivacyValueSchema, { privacy: 'match_last_seen' }],
  ['read-receipts', privacy.UpdateReadReceiptsPrivacyValueSchema, { privacy: 'all' }],
  ['groups-add', privacy.UpdateGroupsAddPrivacyValueSchema, { privacy: 'contacts' }],
  ['default-disappearing-mode', privacy.UpdateDefaultDisappearingModeSchema, { mode: 'OFF' }],
] as const) {
  registry[`PUT /session/:sessionId/privacy/${setting}`] = {
    body: schema,
    example,
  }
}

export function getRequestDetails(method: string, path: string): RequestDetails {
  return registry[`${method} ${path.replace(/^\/(admin|api\/v1)\/session/, '/session')}`] ?? {}
}

export const parameterExamples: Record<string, { value: string; description: string }> = {
  quickMessageId: { value: id, description: 'UUID da mensagem rápida, pertencente à sessão.' },
  sessionId: { value: id, description: 'Identificador da sessão WhatsApp.' },
  contactId: { value: id, description: 'UUID interno do contato na sessão.' },
  labelId: { value: id, description: 'UUID da etiqueta de conversas, pertencente à sessão.' },
  conversationId: {
    value: id,
    description: 'UUID interno da conversa, pertencente à sessão.',
  },
  messageRecordId: {
    value: id,
    description: 'UUID interno da mensagem; não é o ID WhatsApp.',
  },
  mediaId: {
    value: id,
    description: 'UUID interno da mídia, pertencente à conversa e sessão.',
  },
  messageId: {
    value: 'ABC123WHATSAPP',
    description: 'ID original da mensagem no WhatsApp, não o UUID interno.',
  },
  userId: { value: id, description: 'Identificador do usuário.' },
  webhookId: { value: id, description: 'Identificador do webhook.' },
  logId: { value: id, description: 'Identificador do log de entrega.' },
  jid: {
    value: '120363000000000000@g.us',
    description:
      'JID do grupo (@g.us) ou do contato (@s.whatsapp.net ou @lid), conforme a operação. Codifique o valor na URL.',
  },
}

export function paginationDocumentation(type: RequestDetails['pagination']): string {
  if (type === 'offset')
    return '### Paginação por página\nQuery: page=1&pageSize=20 (defaults: 1 e 100). Próxima página: page=2&pageSize=20, mantendo os filtros. Resposta: {"status":"success","data":[],"page":"1","pageSize":"20","total":0}. page e pageSize na resposta são strings. Pare quando page * pageSize >= total. Use inteiros positivos; as rotas legadas de sessões/webhooks apenas convertem as strings, sem validar limites máximos.'
  if (type === 'messages')
    return '### Paginação de mensagens\nPrimeira chamada: ?limit=50 (últimas mensagens). Para anteriores: ?limit=50&before=CURSOR_RETORNADO. Para posteriores: ?limit=50&after=CURSOR_RETORNADO. Nunca combine before e after. Resposta: {"status":"success","data":[],"page":{"nextCursor":null,"hasMore":false},"boundaries":{"first":null,"last":null}}. Copie os cursores opacos de page.nextCursor e boundaries.first/last conforme a direção; não use IDs no lugar. Dados são apresentados em ordem cronológica. limit: 1–100 (default 50).'
  if (type === 'cursor')
    return '### Paginação por cursor\nPrimeira chamada: ?limit=50. Próxima: ?limit=50&cursor=CURSOR_RETORNADO, preservando q/kind quando aplicáveis. Resposta: {"status":"success","data":[],"page":{"nextCursor":null,"hasMore":false}}. Continue enquanto page.hasMore for true, usando page.nextCursor. Cursores são opacos, assinados e escopados à sessão/consulta; não os fabrique nem reutilize em outra conversa/filtro. limit: 1–100 (default 50).'
  return '### Paginação\nEsta operação não é paginada.'
}
