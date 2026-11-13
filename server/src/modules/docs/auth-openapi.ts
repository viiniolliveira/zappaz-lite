import { auth, authAllowedEndpoints } from '@server/lib/auth.ts'
import { authBodySchemas } from '@server/lib/auth-policy.ts'
import { z } from 'zod'

type AuthSchema = Awaited<ReturnType<typeof auth.api.generateOpenAPISchema>>
type AuthOperation = NonNullable<AuthSchema['paths'][string]['get']>

const summaries: Record<string, string> = {
  '/admin/list-users': 'Listar usuários',
  '/admin/create-user': 'Criar usuário',
  '/admin/update-user': 'Atualizar usuário',
  '/admin/set-role': 'Alterar papel do usuário',
  '/admin/set-user-password': 'Redefinir senha do usuário',
  '/admin/remove-user': 'Excluir usuário',
}

const notes: Record<string, string> = {
  '/admin/create-user':
    'data.lastName é obrigatório. Telefone é opcional; informe de 7 a 15 dígitos ou null.',
  '/admin/update-user':
    'Informe ao menos um campo em data. phone: null remove o telefone; omitir preserva o valor atual.',
  '/admin/set-role':
    'Papéis permitidos: USER e ADMIN. Não é possível rebaixar o último administrador ativo.',
  '/admin/set-user-password': 'Revoga os logins da conta afetada. Não exige sua senha atual.',
  '/admin/remove-user':
    'Não permite excluir a própria conta nem o último administrador ativo. Remove também suas sessões WhatsApp e dados associados.',
}

function documentAdminOperation(path: string, operation: AuthOperation) {
  const bodySchema = Object.entries(authBodySchemas).find(([key]) => key === path)?.[1]
  return {
    ...operation,
    summary: summaries[path],
    description: [
      operation.description || summaries[path],
      'Exige sessão de administrador (ADMIN).',
      'Endpoint nativo da interface em `/api/auth/*`: exige cookie de login e não aceita API Key. Para as operações de integração, use o header `x-api-key` nas rotas `/api/v1/*`.',
      notes[path],
    ]
      .filter(Boolean)
      .join('\n\n'),
    tags: ['Usuários'],
    security: [{ cookieAuth: [] }],
    parameters: operation.parameters ?? [],
    ...(bodySchema
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: z.toJSONSchema(bodySchema, { io: 'input' }) },
            },
          },
        }
      : {}),
  }
}

export async function generateAdminAuthPaths() {
  const schema = await auth.api.generateOpenAPISchema()
  const paths: Record<string, Record<string, ReturnType<typeof documentAdminOperation>>> = {}
  for (const [path, methods] of Object.entries(schema.paths)) {
    if (!path.startsWith('/admin/')) continue
    for (const [method, operation] of Object.entries(methods)) {
      if (!authAllowedEndpoints[method.toUpperCase()]?.includes(path)) continue
      const fullPath = `/api/auth${path}`
      paths[fullPath] ??= {}
      paths[fullPath][method] = documentAdminOperation(path, operation)
    }
  }
  return { paths, schemas: schema.components.schemas }
}
