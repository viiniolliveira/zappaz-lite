import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import * as Bun from 'bun'
import type { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { SharedContactSchema } from '../../server/src/lib/chat-contract.ts'
import { getRequestDetails } from '../../server/src/modules/docs/requests.ts'
import { receivedVcard, sentVcard } from '../whatsapp/vcard-fixture.ts'

const users: Record<string, { id: string; role: string }> = {
  user: { id: 'user', role: 'USER' },
  admin: { id: 'admin', role: 'ADMIN' },
}
mock.module('@db/prisma', () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users[where.id] ?? null,
    },
    waSession: { findUnique: async () => null },
  },
}))

const nativeAuthPaths = {
  '/sign-in/email': { post: {} },
  '/get-session': { get: {} },
  '/sign-out': { post: {} },
  '/update-user': { post: {} },
  '/change-email': { post: {} },
  '/change-password': { post: {} },
  '/api-key/list': { get: {} },
  '/api-key/create': { post: {} },
  '/api-key/delete': { post: {} },
  '/admin/list-users': { get: {} },
  '/admin/create-user': { post: {} },
  '/admin/update-user': { post: {} },
  '/admin/set-role': { post: {} },
  '/admin/set-user-password': { post: {} },
  '/admin/remove-user': { post: {} },
  '/admin/ban-user': { post: {} },
  '/sign-up/email': { post: {} },
  '/reference': { get: {} },
}
mock.module('@server/lib/auth.ts', () => ({
  authAllowedEndpoints: {
    GET: ['/get-session', '/admin/list-users', '/api-key/list'],
    POST: [
      '/sign-in/email',
      '/sign-out',
      '/update-user',
      '/change-email',
      '/change-password',
      '/api-key/create',
      '/api-key/delete',
      '/admin/create-user',
      '/admin/update-user',
      '/admin/set-role',
      '/admin/set-user-password',
      '/admin/remove-user',
    ],
  },
  auth: {
    api: {
      generateOpenAPISchema: async () => ({
        paths: Object.fromEntries(
          Object.entries(nativeAuthPaths).map(([path, methods]) => [
            path,
            Object.fromEntries(
              Object.keys(methods).map((method) => [
                method,
                { summary: path, description: path, responses: { '200': { description: 'OK' } } },
              ]),
            ),
          ]),
        ),
        components: { schemas: {} },
      }),
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('cookie')?.replace('session=', '')
        return id && users[id] ? { user: { id } } : null
      },
    },
    handler: () => new Response(null, { status: 404 }),
  },
}))

// Exercise the real route declarations without loading services, WhatsApp or a database.
const controllerNames: Record<string, string> = {
  auth: 'changePasswordController getCurrentUserController logOutController loginController updateCurrentUserController',
  sessions:
    'archiveSessionController connectSessionController createSessionController getSessionByIdController getSessionsController logoutSessionController removeSessionController unArchiveSessionController updateSessionController',
  webhooks:
    'createWebhookController getWebhookByIdController getWebhookLogByIdController getWebhookLogsController getWebhooksController removeWebhookController retryWebhookLogController updateWebhookController',
  'global-webhooks':
    'createGlobalWebhookController getGlobalWebhooksController removeGlobalWebhookController updateGlobalWebhookController',
  'whatsapp-messages':
    'deleteMessageForEveryoneController editTextMessageController getMessageByIdController getMessagesController getMessageMediaController getMessageMediaBase64Controller getMessageMediaBinaryController sendAudioMessageController sendContactMessageController sendDocumentMessageController sendImageMessageController sendLocationMessageController sendTextMessageController sendVideoMessageController',
  'whatsapp-actions':
    'blockContactController getAboutController getDisplayPictureController isOnWhatsAppController unblockContactController updateDisplayPictureController updateProfileNameController updateProfileStatusController',
  'whatsapp-groups':
    'createGroupController getInviteCodeController leaveGroupController listGroupsController revokeInviteCodeController sendInviteController updateGroupController',
  'whatsapp-privacy':
    'getPrivacySettingsController updateDefaultDisappearingModeController updateGroupsAddPrivacyController updateLastSeenPrivacyController updateOnlinePrivacyController updateProfilePicturePrivacyController updateReadReceiptsPrivacyController updateStatusPrivacyController',
  contacts:
    'deleteContactController listContactsController refreshContactAvatarController saveContactController saveExistingContactController updateContactController',
  conversations:
    'createConversationController deleteConversationController getConversationController listConversationsController readConversationController setConversationReadStateController',
  'conversation-labels':
    'createLabelController deleteLabelController listLabelsController setConversationLabelsController updateLabelController',
  'conversation-messages':
    'deleteMessageController editMessageController downloadMediaController getChatMessageController listMediaController listMessagesController sendMediaController sendTextController',
  'chat-library': 'listLibraryController',
  'send-message-history': 'getSendMessageHistoryController',
}
const controller = (c: Context) => c.json({ ok: true })
for (const [module, names] of Object.entries(controllerNames)) {
  mock.module(`../../server/src/modules/${module}/controller.ts`, () => ({
    ...Object.fromEntries(names.split(' ').map((name) => [name, controller])),
    ...(module === 'whatsapp-groups'
      ? { updateGroupParticipantsController: () => controller }
      : {}),
  }))
}
const nextMiddleware = (_c: Context, next: Next) => next()
mock.module('../../server/src/middleware/session.ts', () => ({
  requireEnabledSession: nextMiddleware,
  requireConnectedSession: nextMiddleware,
}))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { notFoundHandler } = await import('../../server/src/common/http/not-found-handler.ts')
const { createDocsRouter } = await import('../../server/src/modules/docs/route.ts')
const { describeApiRoute } = await import('../../server/src/modules/docs/openapi.ts')
const app = createApp()
app.onError(errorHandler)
app.notFound(notFoundHandler)
app.get('/health', describeApiRoute('GET', '/health'), (c) => c.json({ ok: true }))
for (const module of Object.keys(controllerNames)) {
  const routes = await import(`../../server/src/modules/${module}/route.ts`)
  if (module === 'sessions') {
    app.route('/admin', routes.adminSessionsRouter)
    app.route('/api/v1', routes.apiSessionsRouter)
  } else if (module === 'send-message-history') {
    app.route('/admin', routes.default)
    app.route('/api/v1', routes.apiSendMessageHistoryRouter)
  } else {
    app.route(module === 'global-webhooks' ? '/admin' : '/', routes.default)
  }
}
app.all('/mcp', (c) => c.json({ ok: true }))
app.all('/api/auth/*', (c) => c.json({ ok: true }))
app.route('/', createDocsRouter(app))
app.get('/frontend-fixture', (c) => c.text('frontend'))

const sessionToken = jwt.sign({ sessionId: 'session' }, 'session-secret')
for (const path of ['/docs', '/openapi.json']) {
  for (const headers of [
    {},
    { authorization: 'Bearer invalid' },
    { authorization: 'Bearer invalid-user-token' },
    { authorization: 'Bearer unknown-user-token' },
    { authorization: `Bearer ${sessionToken}` },
  ]) {
    const response = await app.request(path, { headers })
    assert.equal(response.status, 401, path)
    const body = await response.json()
    assert.equal(body.ok, false)
    assert.equal(body.error.message, 'Access denied')
  }

  for (const headers of [{ cookie: 'session=user' }, { cookie: 'session=admin' }]) {
    const response = await app.request(path, { headers })
    assert.equal(response.status, 200, path)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const body = await response.text()
    if (path === '/docs') {
      assert.match(response.headers.get('content-type') ?? '', /text\/html/)
      assert.match(body, /scalar/i)
      assert.match(body, /\/openapi\.json/)
      assert.match(body, /"content":\s*\{/)
      assert.match(body, /"openapi":\s*"3\./)
      assert.ok(!body.includes('session=user'))
      assert.match(body, /"proxyUrl":\s*""/)
      assert.match(body, /"showDeveloperTools":\s*"never"/)
      assert.match(body, /Payloads dos webhooks/)
      assert.doesNotMatch(body, /\/api\/auth\/sign-in\/email/)
      assert.match(body, /\/admin\/session/)
      assert.match(body, /\/api\/auth\/admin\/list-users/)
      assert.match(body, /"x-tagGroups"/)
      assert.match(body, /BASE64_JPEG_DA_MINIATURA/)
      assert.doesNotMatch(body, /OpenCollection|usebruno/)
      continue
    }
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    const operationSchema = z.object({
      summary: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
      security: z.array(z.record(z.string(), z.array(z.string()))),
      parameters: z.array(
        z.object({
          name: z.string(),
          in: z.string(),
          required: z.boolean().optional(),
          schema: z.unknown(),
          example: z.unknown().optional(),
        }),
      ),
      requestBody: z
        .object({
          content: z.record(
            z.string(),
            z.object({ schema: z.unknown(), example: z.unknown().optional() }),
          ),
        })
        .optional(),
      responses: z.record(
        z.string(),
        z.object({
          description: z.string(),
          content: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    })
    const spec = z
      .object({
        openapi: z.string(),
        info: z.object({ title: z.string(), description: z.string() }),
        servers: z.array(z.object({ url: z.string() })),
        paths: z.record(z.string(), z.record(z.string(), operationSchema)),
        'x-tagGroups': z.array(z.object({ name: z.string(), tags: z.array(z.string()) })),
        components: z.object({
          securitySchemes: z.record(
            z.string(),
            z.object({
              type: z.string(),
              in: z.string(),
              name: z.string(),
              description: z.string(),
            }),
          ),
        }),
      })
      .parse(JSON.parse(body))
    assert.match(spec.openapi, /^3\./)
    assert.equal(spec.info.title, 'Zappaz API')
    const authGuide = spec.info.description.match(
      /## Autenticação com API Key\n([\s\S]*?)(?=\n## |\n# |$)/,
    )?.[1]
    assert.ok(authGuide, 'O guia deve explicar autenticação para integrações')
    assert.match(authGuide, /Chaves de API.*interface/i)
    assert.match(authGuide, /Authentication[\s\S]*userApiKey[\s\S]*valor da chave/i)
    assert.match(authGuide, /curl[\s\S]*-H\s+['"]x-api-key: SUA_API_KEY['"]/i)
    assert.match(authGuide, /não é necessário fazer login nem enviar cookies/i)
    assert.match(authGuide, /não use `Authorization: Bearer`/i)
    assert.match(authGuide, /\/api\/auth\/\*.*cookie de login, não API Key/i)
    assert.deepEqual(Object.keys(spec.components.securitySchemes), ['userApiKey', 'cookieAuth'])
    const apiKey = spec.components.securitySchemes.userApiKey
    assert.equal(apiKey.type, 'apiKey')
    assert.equal(apiKey.in, 'header')
    assert.equal(apiKey.name, 'x-api-key')
    assert.match(apiKey.description, /x-api-key: SUA_API_KEY/)
    assert.match(apiKey.description, /sem Bearer/i)
    assert.match(apiKey.description, /não exige login ou cookies/i)
    for (const [path, scope] of [
      ['/admin/session', /chave global.*ADMIN/i],
      ['/api/v1/session', /chave do usuário[\s\S]*papel, propriedade e escopo/i],
      [
        '/api/v1/session/{sessionId}/webhook',
        /chave restrita à sessão[\s\S]*chave global autorizada/i,
      ],
    ] as const) {
      const operation = spec.paths[path].get
      assert.deepEqual(operation.security, [{ userApiKey: [] }, { cookieAuth: [] }], path)
      assert.match(operation.description, /x-api-key: SUA_API_KEY/, path)
      assert.match(operation.description, /não exige login ou cookies/i, path)
      assert.match(operation.description, /não use `Authorization: Bearer`/i, path)
      assert.match(operation.description, scope, path)
    }
    for (const path of [
      '/api/v1/session/{sessionId}/message/{messageId}',
      '/api/v1/session/{sessionId}/conversations/{conversationId}/messages/{messageRecordId}',
    ]) {
      const edit = spec.paths[path].patch
      assert.equal(edit.summary, 'Editar mensagem de texto')
      assert.deepEqual(edit.security, [{ userApiKey: [] }, { cookieAuth: [] }])
      const request = edit.requestBody?.content['application/json']
      assert.deepEqual(request?.example, { text: 'Olá! Texto atualizado.' })
      const schema = z
        .object({
          required: z.array(z.string()),
          properties: z.object({
            text: z.object({ minLength: z.number(), maxLength: z.number() }),
          }),
        })
        .parse(request?.schema)
      assert.deepEqual(schema.required, ['text'])
      assert.equal(schema.properties.text.minLength, 1)
      assert.equal(schema.properties.text.maxLength, 65536)
      assert.ok(edit.responses['200'])
    }
    assert.match(spec.info.description, /Como configurar o MCP/)
    const presetsSection = spec.info.description.match(
      /## Presets e webhooks no MCP\n([\s\S]*?)(?=\n## |\n# |$)/,
    )?.[1]
    assert.ok(presetsSection, 'A descrição do Scalar deve explicar presets e webhooks no MCP')
    for (const term of [
      'user',
      'session',
      'x-zappaz-preset',
      'x-zappaz-session-id',
      'sessionId',
      'get_webhooks',
      'create_webhook',
      'update_webhook',
      'delete_webhook',
    ]) {
      assert.ok(presetsSection.includes(term), `Presets e webhooks no MCP: ${term}`)
    }
    assert.match(presetsSection, /user[^\n]*chave global[^\n]*sessionId/i)
    assert.match(presetsSection, /session[^\n]*x-zappaz-session-id[^\n]*não recebem `sessionId`/i)
    assert.match(presetsSection, /user[^\n]*sessionId[^\n]*session[^\n]*header/i)
    assert.match(presetsSection, /WhatsApp desconectado/i)
    assert.match(presetsSection, /não gerenciam webhooks globais/i)
    assert.match(presetsSection, /webhookId/)
    const configurationBlocks = [
      ...spec.info.description.matchAll(/```(json|toml)\n([\s\S]*?)\n```/g),
    ]
    const jsonExamples = configurationBlocks
      .filter((block) => block[1] === 'json')
      .map((block) => JSON.parse(block[2]) as unknown)
    const claudeSchema = z.object({
      mcpServers: z.object({
        zappaz: z.object({
          type: z.literal('http'),
          url: z.string(),
          headers: z.object({
            'x-api-key': z.literal('${ZAPPAZ_API_KEY}'),
            'x-zappaz-preset': z.literal('session'),
            'x-zappaz-session-id': z.literal('ID_DA_SESSAO'),
          }),
        }),
      }),
    })
    const claudeExamples = jsonExamples
      .map((value) => claudeSchema.safeParse(value))
      .filter((result) => result.success)
    assert.equal(claudeExamples.length, 1)
    assert.equal(claudeExamples[0].data.mcpServers.zappaz.url, 'http://localhost:3001/mcp')
    const opencodeSchema = z.object({
      $schema: z.literal('https://opencode.ai/config.json'),
      mcp: z.object({
        servers: z.object({
          zappaz: z.object({
            type: z.literal('remote'),
            url: z.string(),
            oauth: z.literal(false),
            protocol: z.literal('auto'),
            headers: z.object({
              'x-api-key': z.literal('{env:ZAPPAZ_API_KEY}'),
              'x-zappaz-preset': z.literal('session'),
              'x-zappaz-session-id': z.literal('ID_DA_SESSAO'),
            }),
          }),
        }),
      }),
    })
    const opencodeExamples = jsonExamples
      .map((value) => opencodeSchema.safeParse(value))
      .filter((result) => result.success)
    assert.equal(opencodeExamples.length, 1)
    assert.equal(opencodeExamples[0].data.mcp.servers.zappaz.url, 'http://localhost:3001/mcp')
    const tomlExamples = configurationBlocks.filter((block) => block[1] === 'toml')
    assert.equal(tomlExamples.length, 1)
    assert.deepEqual(Bun.TOML.parse(tomlExamples[0][2]), {
      mcp_servers: {
        zappaz: {
          url: 'http://localhost:3001/mcp',
          env_http_headers: { 'x-api-key': 'ZAPPAZ_API_KEY' },
          http_headers: {
            'x-zappaz-preset': 'session',
            'x-zappaz-session-id': 'ID_DA_SESSAO',
          },
        },
      },
    })
    assert.match(spec.info.description, /Request headers está em beta/)
    assert.match(spec.info.description, /https:\/\/code\.claude\.com\/docs\/en\/mcp/)
    assert.match(spec.info.description, /https:\/\/developers\.openai\.com\/codex\/mcp\//)
    assert.match(spec.info.description, /https:\/\/opencode\.ai\/v2\/docs\/mcp-servers/)
    assert.match(spec.info.description, /# Payloads dos webhooks/)
    const webhookExamples = [...spec.info.description.matchAll(/```json\n([\s\S]*?)\n```/g)]
      .map((match) => JSON.parse(match[1]) as unknown)
      .filter((value) => z.object({ event: z.string() }).safeParse(value).success)
      .map((value) =>
        z
          .object({
            event: z.string(),
            payload: z.record(z.string(), z.unknown()),
            session: z.object({
              id: z.string(),
              status: z.string(),
              jid: z.string(),
            }),
          })
          .parse(value),
      )
    assert.ok(webhookExamples.length >= 10)
    const contactExamples = webhookExamples.filter(
      (example) =>
        z.object({ type: z.literal('contact') }).safeParse(example.payload.message).success,
    )
    assert.equal(contactExamples.length, 2)
    const sharedContacts = contactExamples.flatMap(
      (example) =>
        z.object({ contacts: z.array(SharedContactSchema) }).parse(example.payload.message)
          .contacts,
    )
    assert.deepEqual(
      sharedContacts.map((contact) => contact.vcard),
      [receivedVcard, sentVcard],
    )
    assert.deepEqual(
      sharedContacts.map((contact) => contact.name),
      ['Maria', 'Contato de teste Zappaz'],
    )
    assert.equal(sharedContacts[1].parsed?.phones[0].waid, '5511999999999')
    const locationExample = webhookExamples.find(
      (example) =>
        z.object({ type: z.literal('location') }).safeParse(example.payload.message).success,
    )
    assert.ok(locationExample)
    assert.equal(locationExample.event, 'outbound-message.upsert')
    const locationPayload = z
      .object({
        location: z.strictObject({
          name: z.literal('Google São Paulo'),
          address: z.literal('Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil'),
          url: z.literal('www.google.com'),
        }),
      })
      .parse(locationExample.payload.message)
    assert.ok(!('latitude' in locationPayload.location))
    assert.ok(!('longitude' in locationPayload.location))
    assert.match(spec.info.description, /## Resposta a uma mensagem \(reply\)/)
    const replySchema = z.object({
      id: z.string().uuid(),
      messageId: z.literal('RESPOSTA456'),
      conversationId: z.string().uuid(),
      text: z.literal('Sim, podemos marcar amanhã.'),
      sender: z.object({ id: z.literal('5511999999999@s.whatsapp.net') }),
      replyTo: z.strictObject({
        id: z.literal('MENSAGEM_ORIGINAL123'),
        senderId: z.literal('5511888888888@s.whatsapp.net'),
        type: z.literal('text'),
        text: z.literal('Podemos marcar amanhã?'),
      }),
    })
    const replyExamples = webhookExamples.filter(
      (example) => replySchema.safeParse(example.payload.message).success,
    )
    assert.equal(replyExamples.length, 1)
    assert.equal(replyExamples[0].event, 'inbound-message.upsert')
    assert.deepEqual(
      [...new Set(webhookExamples.map((example) => example.event))],
      [
        'inbound-message.upsert',
        'outbound-message.upsert',
        'messages.update',
        'messages.reaction',
        'message-receipt.update',
      ],
    )
    for (const example of webhookExamples) {
      const payload = example.payload
      const references = example.event.endsWith('upsert')
        ? [payload.message]
        : (payload.messages ?? payload.reactions ?? payload.receipts)
      const items = z
        .array(
          z.object({
            id: z.string(),
            chatId: z.string(),
            remoteJid: z.string(),
            lid: z.string(),
            fromMe: z.boolean(),
          }),
        )
        .parse(references)
      assert.ok(
        items.every(
          (item) => item.remoteJid.endsWith('@s.whatsapp.net') && item.lid.endsWith('@lid'),
        ),
      )
    }
    assert.deepEqual(spec.servers, [{ url: '/' }])
    const contacts = '/api/v1/session/{sessionId}/contacts'
    const contactOperations = [
      [contacts, 'get', 'Listar contatos', 'Lista contatos. Aceita limit, cursor e q.'],
      [
        `${contacts}/{contactId}/avatar`,
        'post',
        'Atualizar foto do contato',
        'Reutiliza o cache de uma hora, inclusive ausência de foto; retorna ContactDTO com avatarCheckedAt.',
      ],
      [
        contacts,
        'post',
        'Salvar contato',
        'Salva ou atualiza um contato. Não altera a agenda do WhatsApp.',
      ],
      [
        `${contacts}/{contactId}`,
        'put',
        'Atualizar contato',
        'Salva ou atualiza um contato. Não altera a agenda do WhatsApp.',
      ],
      [
        `${contacts}/{contactId}`,
        'patch',
        'Atualizar contato',
        'Salva ou atualiza um contato. Não altera a agenda do WhatsApp.',
      ],
      [
        `${contacts}/{contactId}`,
        'delete',
        'Remover contato',
        'Remove da agenda local um contato. Não altera a agenda do WhatsApp.',
      ],
      [
        '/api/v1/session/{sessionId}/conversations/{conversationId}/media',
        'get',
        'Listar mídias',
        'Lista mídias a partir das mensagens, em ordem crescente de orderAt/id, com count independente do cursor. Aceita limit, cursor e kind; a galeria usa kind=gallery e limit=24.',
      ],
      [
        '/api/v1/session/{sessionId}',
        'put',
        'Atualizar a própria sessão',
        'Atualiza a própria sessão; administradores podem atualizar qualquer sessão. Somente administradores podem alterar enabled.',
      ],
    ]
    for (const [path, method, summary, description] of contactOperations) {
      const operation = spec.paths[path]?.[method]
      assert.ok(operation, `${method} ${path}`)
      assert.equal(operation.summary, summary, `${method} ${path}`)
      assert.ok(operation.description.includes(description), `${method} ${path}`)
    }
    const library = spec.paths['/api/v1/session/{sessionId}/library']?.get
    assert.ok(library, 'GET library documentada')
    assert.deepEqual(library.tags, ['Mensagens'])
    assert.match(library.description, /hasLink persistido/)
    assert.deepEqual(
      library.parameters
        .filter((param) => param.in === 'query')
        .map((param) => param.name)
        .sort(),
      ['conversationId', 'cursor', 'kind', 'limit'],
    )
    const createUser = spec.paths['/api/auth/admin/create-user'].post
    assert.equal(createUser.summary, 'Criar usuário')
    assert.match(createUser.description, /\/admin\/create-user/)
    assert.match(createUser.description, /data\.lastName é obrigatório/)
    assert.match(createUser.description, /Exige sessão de administrador/)
    const tagGroups = [
      {
        name: 'API',
        tags: [
          'Sessões',
          'Mensagens WhatsApp',
          'Webhooks de sessão',
          'Grupos',
          'Ações WhatsApp',
          'Privacidade',
        ],
      },
      { name: 'Chat', tags: ['Contatos', 'Conversas', 'Etiquetas', 'Mensagens'] },
      {
        name: 'Admin',
        tags: ['Sessões administrativas', 'Administração', 'Webhooks globais', 'Usuários'],
      },
    ]
    assert.deepEqual(spec['x-tagGroups'], tagGroups)
    const allowedTags = tagGroups.flatMap((group) => group.tags)
    assert.deepEqual(
      [
        ...new Set(
          Object.values(spec.paths).flatMap((methods) =>
            Object.values(methods).flatMap((operation) => operation.tags),
          ),
        ),
      ].sort(),
      [...allowedTags].sort(),
    )
    assert.deepEqual(Object.keys(spec.components.securitySchemes).sort(), [
      'cookieAuth',
      'userApiKey',
    ])
    let operations = 0
    let examples = 0
    for (const [path, methods] of Object.entries(spec.paths)) {
      assert.ok(!(path.includes(':') || path.includes('*')), path)
      assert.ok(
        path.startsWith('/api/v1/') ||
          path.startsWith('/admin/') ||
          path.startsWith('/api/auth/admin/'),
        path,
      )
      assert.ok(!['/docs', '/openapi.json', '/mcp', '/frontend-fixture'].includes(path), path)
      for (const [method, operation] of Object.entries(methods)) {
        operations++
        const route = path.replace(/\{([^}]+)\}/g, ':$1')
        assert.ok(
          app.routes.some(
            (entry) =>
              (entry.method === method.toUpperCase() && entry.path === route) ||
              (route.startsWith('/api/auth/') &&
                entry.path === '/api/auth/*' &&
                entry.method === 'ALL'),
          ),
          `${method} ${path}`,
        )
        const details = getRequestDetails(method.toUpperCase(), route)
        for (const param of operation.parameters.filter((param) => param.in === 'path')) {
          assert.equal(param.required, true, param.name)
          assert.ok(param.example, param.name)
        }
        if (details.body) {
          examples++
          const mediaType = details.multipart ? 'multipart/form-data' : 'application/json'
          const content = operation.requestBody?.content[mediaType]
          assert.ok(content, `${method} ${path}`)
          const example = details.multipart
            ? {
                ...z.record(z.string(), z.unknown()).parse(content.example),
                file: new File(['preview'], 'foto.jpg', { type: 'image/jpeg' }),
              }
            : content.example
          assert.ok(details.body.safeParse(example).success, `${method} ${path}`)
          if (details.multipart) {
            const schema = z
              .object({
                properties: z.object({
                  file: z.object({
                    type: z.literal('string'),
                    format: z.literal('binary'),
                  }),
                }),
              })
              .parse(content.schema)
            assert.equal(schema.properties.file.format, 'binary')
          }
        }
      }
    }
    assert.ok(operations > 50, String(operations))
    assert.ok(examples > 0, String(examples))
    for (const path of Object.keys(nativeAuthPaths)) {
      const documented = spec.paths[`/api/auth${path}`]
      if (path.startsWith('/admin/') && path !== '/admin/ban-user') {
        for (const method of Object.keys(nativeAuthPaths[path as keyof typeof nativeAuthPaths])) {
          assert.deepEqual(documented?.[method]?.tags, ['Usuários'], `${method} ${path}`)
          assert.deepEqual(
            documented?.[method]?.security,
            [{ cookieAuth: [] }],
            `${method} ${path}`,
          )
          assert.match(
            documented[method].description,
            /exige cookie de login e não aceita API Key/i,
          )
        }
      } else {
        assert.equal(documented, undefined, path)
      }
    }
    assert.equal(spec.paths['/api/auth/open-api/generate-schema'], undefined)
    assert.equal(spec.paths['/admin/temp-token'], undefined)
    assert.equal(spec.paths['/api/auth/temp-login/verify'], undefined)
    assert.equal(spec.paths['/api/v1/user'], undefined)
    assert.equal(spec.paths['/admin/users'], undefined)
    assert.equal(spec.paths['/health'], undefined)
    for (const entry of app.routes.filter(
      (route) => route.path.startsWith('/admin/') && route.method !== 'ALL',
    )) {
      const path = entry.path.replace(/:([^/]+)/g, '{$1}')
      assert.ok(spec.paths[path]?.[entry.method.toLowerCase()], `${entry.method} ${path}`)
    }
    for (const [path, methods] of Object.entries(spec.paths)) {
      let expectedTag: string | undefined
      if (path.startsWith('/admin/session')) expectedTag = 'Sessões administrativas'
      if (path.endsWith('/send-message-history') && path.startsWith('/admin/'))
        expectedTag = 'Administração'
      if (path.startsWith('/admin/webhook')) expectedTag = 'Webhooks globais'
      if (
        path.includes('/conversation-labels') ||
        /\/conversations\/\{conversationId\}\/labels(?:\/|$)/.test(path)
      )
        expectedTag = 'Etiquetas'
      else if (/\/conversations\/\{conversationId\}\/(?:messages|media)(?:\/|$)/.test(path))
        expectedTag = 'Mensagens'
      else if (path.includes('/conversations')) expectedTag = 'Conversas'
      else if (path.includes('/contacts')) expectedTag = 'Contatos'
      if (expectedTag) {
        for (const [method, operation] of Object.entries(methods)) {
          assert.deepEqual(operation.tags, [expectedTag], `${method} ${path}`)
        }
      }
    }
    const base = '/api/v1/session/{sessionId}/conversations/{conversationId}'
    const labelsBase = '/api/v1/session/{sessionId}/conversation-labels'
    for (const [path, method, summary, description] of [
      [labelsBase, 'post', 'Criar etiqueta', 'Cria uma etiqueta somente no Zappaz.'],
      [base, 'delete', 'Excluir conversa', 'Exclui a conversa e o histórico armazenado no Zappaz.'],
      [
        `${base}/messages/{messageRecordId}`,
        'delete',
        'Remover mensagem',
        'Remove uma mensagem da conversa no Zappaz.',
      ],
    ]) {
      const operation = spec.paths[path]?.[method]
      assert.ok(operation, `${method} ${path}`)
      assert.equal(operation.summary, summary, `${method} ${path}`)
      assert.doesNotMatch(operation.summary, /zappaz/i, `${method} ${path}`)
      assert.ok(operation.description.includes(description), `${method} ${path}`)
    }
    assert.ok(spec.paths[labelsBase].get)
    assert.ok(spec.paths[labelsBase].post.responses['201'])
    assert.ok(spec.paths[`${labelsBase}/{labelId}`].patch)
    assert.ok(spec.paths[`${labelsBase}/{labelId}`].delete)
    assert.ok(spec.paths[`${base}/labels`].put)
    assert.ok(
      spec.paths['/api/v1/session/{sessionId}/conversations'].get.parameters.some(
        (param) => param.name === 'labelId',
      ),
    )
    const messages = spec.paths[`${base}/messages`].get
    assert.deepEqual(
      messages.parameters.filter((param) => param.in === 'query').map((param) => param.name),
      ['limit', 'before', 'after'],
    )
    assert.match(messages.description, /Nunca combine before e after/)
    const sessionMessages = spec.paths['/api/v1/session/{sessionId}/messages'].get
    assert.deepEqual(sessionMessages.tags, ['Mensagens WhatsApp'])
    assert.deepEqual(
      sessionMessages.parameters.filter((param) => param.in === 'query').map((param) => param.name),
      ['limit', 'before', 'after', 'conversationId', 'phoneNumber', 'lid', 'jid'],
    )
    const sessionMessage = spec.paths['/api/v1/session/{sessionId}/messages/{messageId}'].get
    assert.deepEqual(sessionMessage.tags, ['Mensagens WhatsApp'])
    assert.deepEqual(
      sessionMessage.parameters.filter((param) => param.in === 'query').map((param) => param.name),
      ['conversationId', 'phoneNumber', 'lid', 'jid'],
    )
    assert.match(body, /nextCursor/)
    assert.match(body, /pageSize/)
    assert.ok(spec.paths[`${base}/messages/text`].post.responses['201'])
    const download = spec.paths[`${base}/media/{mediaId}/content`].get
    assert.ok(download.responses['206'].content?.['application/octet-stream'])
    assert.ok(download.responses['416'])
    const integrationMedia = '/api/v1/session/{sessionId}/message/{messageId}/media'
    assert.equal(spec.paths[integrationMedia], undefined)
    const base64Media = spec.paths[`${integrationMedia}/base64`]?.get
    const binaryMedia = spec.paths[`${integrationMedia}/binary`]?.get
    assert.ok(base64Media?.responses['200'].content?.['application/json'])
    assert.ok(binaryMedia?.responses['200'].content?.['application/octet-stream'])
    assert.ok(binaryMedia?.responses['206'].content?.['application/octet-stream'])
    assert.ok(binaryMedia?.responses['416'])
    assert.equal(spec.paths['/api/v1/session/{sessionId}/webhook/{webhookId}/sse'], undefined)
  }
}
assert.equal((await app.request('/docs/collection.yml')).status, 404)
const frontend = await app.request('/frontend-fixture')
assert.equal(frontend.headers.get('cache-control'), null)
assert.equal(await frontend.text(), 'frontend')
assert.equal((await app.request('/health')).status, 200)
for (const path of ['/admin/session', '/admin/webhook']) {
  assert.equal((await app.request(path)).status, 401, path)
  assert.equal((await app.request(path, { headers: { cookie: 'session=user' } })).status, 403, path)
  const response = await app.request(path, { headers: { cookie: 'session=admin' } })
  assert.equal(response.status, 200, path)
  assert.deepEqual(await response.json(), { ok: true }, path)
}
assert.equal((await app.request('/api/v1/login', { method: 'POST' })).status, 404)
assert.throws(() => describeApiRoute('GET', '/unknown'), /Missing API documentation/)
