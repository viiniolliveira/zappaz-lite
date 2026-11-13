import { Scalar } from '@scalar/hono-api-reference'
import { type AppEnv, createRouter } from '@server/create-app'
import { authMiddleware } from '@server/middleware/auth.ts'
import { requireRole } from '@server/middleware/role.ts'
import type { Context, Hono } from 'hono'
import { describeRoute, type GenerateSpecOptions, generateSpecs } from 'hono-openapi'
import { generateAdminAuthPaths } from './auth-openapi.ts'
import { mcpTutorial } from './openapi.ts'
import { webhookPayloadsDocumentation } from './webhook-payloads.ts'

export function createDocsRouter(app: Hono<AppEnv>) {
  const options: Partial<GenerateSpecOptions> = {
    documentation: {
      info: {
        title: 'Zappaz API',
        version: '1.0.0',
        description: `API HTTP do Zappaz Lite. Powered by Zappaz Lite.

## Autenticação com API Key

Para SDKs, bots e integrações, envie o header \`x-api-key: SUA_API_KEY\` em cada requisição. Não é necessário fazer login nem enviar cookies. Não use \`Authorization: Bearer\` nem acrescente \`Bearer\` ao valor da chave.

Crie a chave na página **Chaves de API** da interface e guarde o segredo exibido na criação. Use uma chave restrita à sessão para operações dessa sessão; operações globais exigem uma chave global, e operações administrativas exigem também o papel ADMIN.

No Scalar, abra **Authentication**, selecione \`userApiKey\` e informe somente o valor da chave. O visualizador enviará o header \`x-api-key\` automaticamente.

\`\`\`sh
curl 'https://zappaz.example.com/api/v1/session/ID_DA_SESSAO/webhook' \\
  -H 'x-api-key: SUA_API_KEY'
\`\`\`

Substitua o domínio pela URL da sua instalação e o ID pela sessão autorizada. Use HTTPS em produção e não coloque a chave na URL, em logs ou no frontend. Endpoints nativos de conta, gerenciamento de chaves e usuários em \`/api/auth/*\` pertencem à interface e exigem cookie de login, não API Key.

[Baixar OpenAPI](/openapi.json).

${webhookPayloadsDocumentation}

${mcpTutorial}`,
      },
      servers: [{ url: '/', description: 'Servidor atual' }],
      components: {
        securitySchemes: {
          userApiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
            description:
              'Envie x-api-key: SUA_API_KEY em cada requisição. Informe somente o valor da chave, sem Bearer. Não exige login ou cookies. Crie uma chave global ou restrita à sessão na página Chaves de API; o acesso respeita papel, propriedade e escopo.',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'better-auth.session_token',
            description:
              'Sessão da interface web: cookie HttpOnly do Better Auth; em HTTPS usa o prefixo __Secure-. Integrações usam o esquema userApiKey, sem cookies.',
          },
        },
      },
    },
    exclude: ['/docs', '/openapi.json', '/mcp'],
  }
  const router = createRouter()
  const generateDocumentation = async (c: Context<AppEnv>) => {
    const [spec, authSpec] = await Promise.all([
      generateSpecs(app, options, c),
      generateAdminAuthPaths(),
    ])
    return {
      ...spec,
      openapi: '3.1.1',
      paths: {
        ...Object.fromEntries(
          Object.entries(spec.paths).filter(
            ([path]) => path.startsWith('/api/v1/') || path.startsWith('/admin/'),
          ),
        ),
        ...authSpec.paths,
      },
      components: {
        ...spec.components,
        schemas: { ...spec.components.schemas, ...authSpec.schemas },
      },
      'x-tagGroups': [
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
      ],
    }
  }
  for (const path of ['/docs', '/openapi.json']) {
    router.use(path, authMiddleware, requireRole(['user', 'admin']), async (c, next) => {
      c.header('Cache-Control', 'private, no-store')
      await next()
    })
  }
  router.get(
    '/docs',
    describeRoute({ hide: true }),
    Scalar<AppEnv>(async (c) => ({
      // Embed the spec for the authenticated documentation page.
      content: await generateDocumentation(c),
      pageTitle: 'Zappaz API — Documentação',
      nonce: c.get('secureHeadersNonce'),
      theme: 'default',
      showDeveloperTools: 'never',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      withDefaultFonts: false,
      // Requests stay in the browser; credentials must not pass through Scalar's proxy.
      proxyUrl: '',
    })),
  )
  router.get('/openapi.json', describeRoute({ hide: true }), async (c) =>
    c.json(await generateDocumentation(c)),
  )
  return router
}
