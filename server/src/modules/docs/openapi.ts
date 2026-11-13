import { type DescribeRouteOptions, describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'
import { getRequestDetails, paginationDocumentation, parameterExamples } from './requests.ts'

type Endpoint = {
  method: string
  path: string
  group: string
  auth?: 'session' | 'user' | 'admin'
  description: string
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/messages',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description:
      'Lista mensagens persistidas da sessão com paginação obrigatória e filtros opcionais por conversa, telefone, LID ou JID. Não inclui grupos e não exige WhatsApp conectado.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/messages/:messageId',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description:
      'Busca uma mensagem persistida pelo ID WhatsApp na sessão e identidade da conversa informadas. Retorna o MessageDTO atual; 404 se não encontrada. Não exige WhatsApp conectado.',
  },
  {
    method: 'GET',
    path: '/api/v1/media/limits',
    group: 'Mídias',
    auth: 'user',
    description:
      'Retorna somente o limite configurado de arquivos para upload e download: {status:"success",data:{maxFileSizeBytes,maxFileSizeMb}}. Exige autenticação; não retorna variáveis de ambiente ou segredos.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/contacts/:contactId/avatar',
    group: 'Contatos e conversas',
    auth: 'session',
    description:
      'Atualiza a URL da foto de um contato com conversa e mensagens. Reutiliza o cache de uma hora, inclusive ausência de foto; retorna ContactDTO com avatarCheckedAt. Exige WhatsApp conectado apenas se o cache estiver vencido.',
  },
  ...['GET', 'POST', 'PATCH', 'DELETE'].map((method) => ({
    method,
    path: `/api/v1/session/:sessionId/quick-messages${['PATCH', 'DELETE'].includes(method) ? '/:quickMessageId' : ''}`,
    group: 'Mensagens rápidas',
    auth: 'session' as const,
    description: `${({ GET: 'Lista', POST: 'Cria', PATCH: 'Atualiza', DELETE: 'Exclui' } as Record<string, string>)[method]} mensagens rápidas da sessão somente no Zappaz. Não exige WhatsApp conectado.`,
  })),
  {
    method: 'GET',
    path: '/health',
    group: 'Infraestrutura',
    description: 'Verifica se a API está respondendo.',
  },
  {
    method: 'GET',
    path: '/admin/session',
    group: 'Sessões',
    auth: 'admin',
    description: 'Lista sessões WhatsApp.',
  },
  {
    method: 'POST',
    path: '/admin/session',
    group: 'Sessões',
    auth: 'admin',
    description: 'Cria uma sessão WhatsApp.',
  },
  {
    method: 'GET',
    path: '/admin/session/:sessionId',
    group: 'Sessões',
    auth: 'admin',
    description: 'Busca uma sessão.',
  },
  {
    method: 'PUT',
    path: '/admin/session/:sessionId',
    group: 'Sessões',
    auth: 'admin',
    description: 'Atualiza uma sessão.',
  },
  {
    method: 'DELETE',
    path: '/admin/session/:sessionId/remove',
    group: 'Sessões',
    auth: 'admin',
    description: 'Remove uma sessão.',
  },
  {
    method: 'PUT',
    path: '/admin/session/:sessionId/archive',
    group: 'Sessões',
    auth: 'admin',
    description: 'Arquiva uma sessão.',
  },
  {
    method: 'PUT',
    path: '/admin/session/:sessionId/un-archive',
    group: 'Sessões',
    auth: 'admin',
    description: 'Desarquiva uma sessão.',
  },
  {
    method: 'GET',
    path: '/api/v1/session',
    group: 'Sessões',
    auth: 'user',
    description: 'Lista sessões do usuário.',
  },
  {
    method: 'POST',
    path: '/api/v1/session',
    group: 'Sessões',
    auth: 'user',
    description: 'Cria uma sessão para o usuário.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId',
    group: 'Sessões',
    auth: 'session',
    description: 'Busca uma sessão.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId',
    group: 'Sessões',
    auth: 'user',
    description:
      'Atualiza a própria sessão; administradores podem atualizar qualquer sessão. Somente administradores podem alterar enabled.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/remove',
    group: 'Sessões',
    auth: 'user',
    description:
      'Exclui permanentemente a própria sessão e seus dados. Administradores podem excluir qualquer sessão.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/connect',
    group: 'Sessões',
    auth: 'session',
    description: 'Conecta a sessão ao WhatsApp.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/send-message-history',
    group: 'Sessões',
    auth: 'user',
    description:
      'Consulta o consumo da própria sessão. Administradores podem consultar qualquer sessão.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId/logout',
    group: 'Sessões',
    auth: 'session',
    description: 'Desconecta a sessão do WhatsApp.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/contacts',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Lista contatos. Aceita limit, cursor e q.',
  },
  ...['POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
    method,
    path: `/api/v1/session/:sessionId/contacts${method === 'POST' ? '' : '/:contactId'}`,
    group: 'Contatos e conversas',
    auth: 'session' as const,
    description: `${method === 'DELETE' ? 'Remove da agenda local' : 'Salva ou atualiza'} um contato. Não altera a agenda do WhatsApp.`,
  })),
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations',
    group: 'Contatos e conversas',
    auth: 'session',
    description:
      'Lista conversas com histórico. Aceita limit, cursor, q e uma etiqueta em labelId.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/conversations',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Cria uma conversa para um contato.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversation-labels',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Lista as etiquetas locais da sessão, ordenadas por nome.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/conversation-labels',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Cria uma etiqueta somente no Zappaz.',
  },
  {
    method: 'PATCH',
    path: '/api/v1/session/:sessionId/conversation-labels/:labelId',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Atualiza nome, descrição e cor de uma etiqueta.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/conversation-labels/:labelId',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Exclui uma etiqueta e seus vínculos, preservando conversas e contatos.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/labels',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Substitui as etiquetas da conversa, sem alterar o contato ou o WhatsApp.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations/:conversationId',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Busca uma conversa.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/conversations/:conversationId',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Exclui a conversa e o histórico armazenado no Zappaz.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/read',
    group: 'Contatos e conversas',
    auth: 'session',
    description: 'Avança o cursor de leitura somente no Zappaz.',
  },
  {
    method: 'PATCH',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/read-state',
    group: 'Contatos e conversas',
    auth: 'session',
    description:
      'Marca a conversa como lida ou não lida somente no Zappaz, sem alterar o WhatsApp.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages',
    group: 'Mensagens',
    auth: 'session',
    description: 'Lista mensagens. Aceita limit, before ou after.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
    group: 'Mensagens',
    auth: 'session',
    description: 'Busca uma mensagem da conversa.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
    group: 'Mensagens',
    auth: 'session',
    description: 'Remove uma mensagem da conversa no Zappaz.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/media',
    group: 'Mensagens',
    auth: 'session',
    description:
      'Lista mídias a partir das mensagens, em ordem crescente de orderAt/id, com count independente do cursor. Aceita limit, cursor e kind; a galeria usa kind=gallery e limit=24.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/library',
    group: 'Mensagens',
    auth: 'session',
    description:
      'Lista mensagens da biblioteca da sessão, sem grupos ou mensagens removidas. Aceita kind=media|document|link|all, conversationId, limit e cursor. all reúne as categorias sem duplicar mensagens. Retorna mensagem, conversa, count total e paginação em ordem decrescente de orderAt/id. Links usam hasLink persistido, inclusive em legendas e sem prévia.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/media/:mediaId/content',
    group: 'Mensagens',
    auth: 'session',
    description: 'Obtém o conteúdo de uma mídia.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages/text',
    group: 'Mensagens',
    auth: 'session',
    description: 'Envia uma mensagem de texto.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages/media',
    group: 'Mensagens',
    auth: 'session',
    description: 'Envia mídia via multipart/form-data.',
  },
  {
    method: 'PATCH',
    path: '/api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId',
    group: 'Mensagens',
    auth: 'session',
    description:
      'Edita uma mensagem própria de texto ou resposta de texto, preservando a citação. Usa o UUID interno da mensagem.',
  },
  {
    method: 'PATCH',
    path: '/api/v1/session/:sessionId/message/:messageId',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description:
      'Edita uma mensagem própria de texto ou resposta de texto no WhatsApp. Usa o ID WhatsApp da mensagem original.',
  },
  ...['text', 'image', 'video', 'audio', 'document', 'contact', 'location'].map((kind) => ({
    method: 'POST',
    path: `/api/v1/session/:sessionId/message/${kind}`,
    group: 'Mensagens WhatsApp',
    auth: 'session' as const,
    description: `Envia uma mensagem do tipo ${kind}.`,
  })),
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/message/:messageId',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description: 'Apaga uma mensagem para todos.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/message/:messageId/media/base64',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description: 'Obtém a mídia de uma mensagem em JSON com base64.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/message/:messageId/media/binary',
    group: 'Mensagens WhatsApp',
    auth: 'session',
    description: 'Obtém a mídia de uma mensagem em binário; aceita Range.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/group',
    group: 'Grupos',
    auth: 'session',
    description: 'Lista grupos.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/group',
    group: 'Grupos',
    auth: 'session',
    description: 'Cria um grupo.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId/group/:jid',
    group: 'Grupos',
    auth: 'session',
    description: 'Atualiza dados do grupo.',
  },
  ...[
    'send-invite',
    'add',
    'remove',
    'promote',
    'demote',
    'invite-code',
    'invite-code-revoke',
    'leave',
  ].map((action) => ({
    method: 'POST',
    path: `/api/v1/session/:sessionId/group/:jid/${action}`,
    group: 'Grupos',
    auth: 'session' as const,
    description: `Executa ${action} no grupo.`,
  })),
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/privacy',
    group: 'Privacidade',
    auth: 'session',
    description: 'Consulta configurações de privacidade.',
  },
  ...[
    'last-seen',
    'online',
    'profile-picture',
    'status',
    'read-receipts',
    'groups-add',
    'default-disappearing-mode',
  ].map((setting) => ({
    method: 'PUT',
    path: `/api/v1/session/:sessionId/privacy/${setting}`,
    group: 'Privacidade',
    auth: 'session' as const,
    description: `Atualiza ${setting}.`,
  })),
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/display-picture',
    group: 'Ações WhatsApp',
    auth: 'session',
    description: 'Obtém a foto do perfil.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId/display-picture',
    group: 'Ações WhatsApp',
    auth: 'session',
    description: 'Atualiza a foto do perfil.',
  },
  ...['update-profile-status', 'update-profile-name'].map((action) => ({
    method: 'PUT',
    path: `/api/v1/session/:sessionId/${action}`,
    group: 'Ações WhatsApp',
    auth: 'session' as const,
    description: `Atualiza ${action}.`,
  })),
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/is-on-whatsapp/:jid',
    group: 'Ações WhatsApp',
    auth: 'session',
    description: 'Verifica se um identificador está no WhatsApp.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/get-about/:jid',
    group: 'Ações WhatsApp',
    auth: 'session',
    description: 'Consulta a descrição de um contato.',
  },
  ...['block-contact', 'unblock-contact'].map((action) => ({
    method: 'PUT',
    path: `/api/v1/session/:sessionId/${action}/:jid`,
    group: 'Ações WhatsApp',
    auth: 'session' as const,
    description: `${action === 'block-contact' ? 'Bloqueia' : 'Desbloqueia'} um contato.`,
  })),
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/webhook',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Lista webhooks da sessão.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/webhook',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Cria um webhook da sessão.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/webhook/:webhookId',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Busca um webhook.',
  },
  {
    method: 'PUT',
    path: '/api/v1/session/:sessionId/webhook/:webhookId',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Atualiza um webhook.',
  },
  {
    method: 'DELETE',
    path: '/api/v1/session/:sessionId/webhook/:webhookId',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Remove um webhook.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/webhook/:webhookId/logs',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Lista logs de entrega.',
  },
  {
    method: 'GET',
    path: '/api/v1/session/:sessionId/webhook/:webhookId/logs/:logId',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Busca um log de entrega.',
  },
  {
    method: 'POST',
    path: '/api/v1/session/:sessionId/webhook/:webhookId/logs/:logId/retry',
    group: 'Webhooks de sessão',
    auth: 'session',
    description: 'Reenvia uma entrega com falha.',
  },
  {
    method: 'GET',
    path: '/admin/session/:sessionId/send-message-history',
    group: 'Administração',
    auth: 'admin',
    description: 'Consulta histórico agregado de mensagens enviadas.',
  },
  {
    method: 'GET',
    path: '/admin/webhook',
    group: 'Webhooks globais',
    auth: 'admin',
    description: 'Lista webhooks globais de todas as sessões.',
  },
  {
    method: 'POST',
    path: '/admin/webhook',
    group: 'Webhooks globais',
    auth: 'admin',
    description: 'Cria um webhook global.',
  },
  {
    method: 'PUT',
    path: '/admin/webhook/:webhookId',
    group: 'Webhooks globais',
    auth: 'admin',
    description: 'Atualiza um webhook global.',
  },
  {
    method: 'DELETE',
    path: '/admin/webhook/:webhookId',
    group: 'Webhooks globais',
    auth: 'admin',
    description: 'Remove um webhook global.',
  },
]

export const mcpTutorial = [
  '# Como configurar o MCP',
  'Conecte por **Streamable HTTP** em `http://localhost:3001/mcp`. Use `x-zappaz-preset: user` com uma chave global para gerenciar sessões, ou `x-zappaz-preset: session` com `x-zappaz-session-id` e uma chave autorizada para limitar as ferramentas a ela.',
  '## Preparação e autenticação',
  '1. Na página Chaves de API, crie uma chave global ou restrita à sessão desejada.\n2. Defina `ZAPPAZ_API_KEY` no ambiente que inicia o cliente.\n3. Configure `x-api-key`, `x-zappaz-preset: session` e `x-zappaz-session-id: ID_DA_SESSAO`.',
  'O `.env` da API não é automaticamente carregado pelo Claude Code, Codex ou OpenCode. Disponibilize a variável ao processo do CLI/editor ou pelo mecanismo de segredos do cliente. Nunca versione um token preenchido.',
  'Envie `x-api-key: SUA_CHAVE`, além dos headers de preset e sessão. O preset user exige chave global; cada ferramenta de sessão recebe `sessionId`. Cookie também é aceito, com Origin confiável nas escritas. Chaves sem escopo explícito não autorizam acesso.',
  '## Presets e webhooks no MCP',
  '**user**: autentique com chave global ou cookie e envie `x-zappaz-preset: user`, sem o header de sessão. As ferramentas de gerenciamento de sessões ficam disponíveis e as demais recebem `sessionId`. O acesso respeita as permissões atuais do usuário.',
  '**session**: envie `x-zappaz-preset: session` e `x-zappaz-session-id: ID_DA_SESSAO`. Autentique com chave restrita a essa sessão, chave global autorizada ou cookie autorizado. As ferramentas ficam limitadas à sessão indicada e não recebem `sessionId`; o gerenciamento de sessões não é exposto.',
  'Nos dois presets, `get_webhooks`, `create_webhook`, `update_webhook` e `delete_webhook` gerenciam webhooks da sessão, mesmo com o WhatsApp desconectado. No preset user informe `sessionId` em cada ferramenta; no session, a sessão vem do header. `create_webhook` recebe `data` com URL, eventos e opções; use `webhookId` para atualizar ou excluir. Essas ferramentas não gerenciam webhooks globais de administrador.',
  '**Ferramentas disponíveis nos dois presets:**\n\n- Mensagens: `send_text_message`, `send_image_message`, `send_video_message`, `send_audio_message`, `send_document_message`, `send_contact_message`, `send_location_message`, `delete_message` e `edit_message`.\n- Grupos: `list_groups`, `get_group_participants`, `create_group`, `update_group`, `add_participants`, `remove_participants`, `promote_participants`, `demote_participants`, `send_group_invite_link` e `update_group_picture`.\n- Webhooks de sessão: `get_webhooks`, `create_webhook`, `update_webhook` e `delete_webhook`.\n\n**Disponíveis somente no preset user:** `list_sessions`, `create_session`, `get_session`, `update_session`, `delete_session`, `connect_session` e `logout_session`.\n\nTodas são ferramentas do endpoint `/mcp`; a disponibilidade não substitui as verificações de permissão e estado da sessão.',
  '`edit_message` recebe `{messageId:"ID_WHATSAPP_ORIGINAL",data:{text:"Texto atualizado"}}` no preset session; no preset user, acrescente sessionId no nível superior. Exige sessão habilitada/conectada. Edita somente textos próprios e respostas de texto, preservando a citação e o horário; retorna o MessageDTO atualizado com editedAt e notifica o chat. Não edita mídias, legendas, templates interativos ou mensagens removidas. Texto completo de 1–65.536 caracteres, não apenas espaços, sem reaplicar assinatura. Operação de escrita com efeito no WhatsApp; não repita automaticamente em falhas.',
  '## Claude Code',
  'Crie ou mescle `.mcp.json` na raiz do projeto. O campo `type: "http"` é obrigatório neste formato; uma entrada só com `url` não é uma configuração HTTP válida no Claude Code.',
  `\`\`\`json\n${JSON.stringify(
    {
      mcpServers: {
        zappaz: {
          type: 'http',
          url: 'http://localhost:3001/mcp',
          headers: {
            'x-api-key': '${ZAPPAZ_API_KEY}',
            'x-zappaz-preset': 'session',
            'x-zappaz-session-id': 'ID_DA_SESSAO',
          },
        },
      },
    },
    null,
    2,
  )}\n\`\`\``,
  'O Claude Code expande `${ZAPPAZ_API_KEY}` ao ler a configuração. Confie no projeto e aprove o servidor de `.mcp.json` quando solicitado. Confira com `claude mcp list`, `claude mcp get zappaz` ou `/mcp` dentro do Claude Code.',
  'Para configurar apenas para seu usuário, em todos os projetos, a alternativa CLI é:',
  "```sh\nclaude mcp add --transport http --scope user zappaz \\\n  'http://localhost:3001/mcp' \\\n  --header 'x-api-key: ${ZAPPAZ_API_KEY}' \\\n  --header 'x-zappaz-preset: session' \\\n  --header 'x-zappaz-session-id: ID_DA_SESSAO'\n```",
  'As aspas simples preservam a referência de ambiente no comando, sem gravar o token expandido na configuração. Escolha o arquivo de projeto **ou** o comando de usuário para evitar definições concorrentes de `zappaz`.',
  '## Codex (CLI e extensão IDE)',
  'Adicione a tabela abaixo em `~/.codex/config.toml` (usuário) ou `.codex/config.toml` (projeto confiável), preservando as demais tabelas. O CLI e a extensão IDE compartilham essa configuração.',
  '```toml\n[mcp_servers.zappaz]\nurl = "http://localhost:3001/mcp"\nenv_http_headers = { "x-api-key" = "ZAPPAZ_API_KEY" }\nhttp_headers = { "x-zappaz-preset" = "session", "x-zappaz-session-id" = "ID_DA_SESSAO" }\n```',
  '`env_http_headers` associa cada header ao nome da variável de ambiente. Não grave a chave no arquivo nem use bearer_token_env_var para esta API.',
  'Confira a entrada com `codex mcp list` e o estado ativo com `/mcp` dentro do Codex. Não execute `codex mcp login zappaz`: esse comando é para OAuth, que este servidor não oferece.',
  '## OpenCode V2',
  'Adicione a configuração em `opencode.jsonc`/`opencode.json` no projeto ou em `~/.config/opencode/opencode.jsonc` para uso pessoal em todos os projetos. Preserve as demais opções. No V2, os servidores ficam em **`mcp.servers`**, não diretamente em `mcp`.',
  `\`\`\`json\n${JSON.stringify(
    {
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        servers: {
          zappaz: {
            type: 'remote',
            url: 'http://localhost:3001/mcp',
            oauth: false,
            protocol: 'auto',
            headers: {
              'x-api-key': '{env:ZAPPAZ_API_KEY}',
              'x-zappaz-preset': 'session',
              'x-zappaz-session-id': 'ID_DA_SESSAO',
            },
          },
        },
      },
    },
    null,
    2,
  )}\n\`\`\``,
  '`oauth: false` seleciona a autenticação por header do Zappaz. `{env:ZAPPAZ_API_KEY}` é a sintaxe de ambiente do OpenCode; `$VAR` e `${VAR}` não a substituem. `protocol: "auto"` permite negociar a revisão MCP suportada pelo servidor SDK v2.',
  'O OpenCode V2 recarrega os arquivos de configuração ao salvar; não é necessário reiniciá-lo. Confira com `opencode mcp list` ou `/mcps`. Se precisar forçar uma recarga completa, use `/reload`.',
  '## Claude web e Claude Desktop (conector remoto)',
  'Claude Code e Claude Desktop/web não usam a mesma configuração. Para um conector remoto do Claude, publique o endpoint em HTTPS: `https://api.example.com/mcp`. A conexão parte da infraestrutura da Anthropic, portanto `localhost` da sua máquina não funciona nesse fluxo.',
  'Quando a sua organização tiver **Request headers** disponível, abra **Customize → Connectors → Add custom connector**, informe a URL e selecione **No sign-in**. Configure `x-api-key: SUA_CHAVE`, `x-zappaz-preset: session` e `x-zappaz-session-id: ID_DA_SESSAO`. O Zappaz continua exigindo autenticação.',
  '**Limitação:** autenticação por Request headers está em beta e restrita a algumas organizações. Se essa opção não aparecer, não configure o Zappaz como um conector remoto sem credencial: ele retornará 401. Use Claude Code com HTTP direto ou, no Claude Desktop, uma ponte stdio local como `mcp-remote`, conforme o guia técnico do projeto. A configuração local do Desktop não é compartilhada com claude.ai/Cowork.',
  '## Verificação e produção',
  'Depois de conectar, confira o catálogo de ferramentas no cliente. Listar ferramentas não exige WhatsApp conectado; operações de mensagens e grupos exigem sessão habilitada e conectada. Enviar/apagar mensagens, alterar grupos e configurar webhooks tem efeito real: revise as aprovações antes de executar.',
  'Em produção, configure APP_URL com a origem HTTPS pública da instalação. As proteções de Host e Origin são derivadas dessa URL; clientes sem Origin continuam sujeitos à validação de Host e autenticação. Guarde tokens como segredos e não os versione.',
  'Erros 401 normalmente indicam token ausente/inválido ou sem acesso à sessão; 403 pode indicar Host/Origin fora das allowlists. Em containers ou clientes remotos, `localhost` identifica o ambiente do cliente, não necessariamente a máquina da API.',
  '## Fontes oficiais',
  'Configurações revisadas a partir das fontes oficiais em 02/11/2026. Os exemplos documentam a configuração; não representam um teste de conexão real em cada aplicativo.\n\n- [Claude Code — MCP](https://code.claude.com/docs/en/mcp)\n- [Claude — conectores e autenticação por headers](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers)\n- [Claude — requisitos de rede](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)\n- [Codex — MCP](https://developers.openai.com/codex/mcp/)\n- [OpenCode V2 — MCP](https://opencode.ai/v2/docs/mcp-servers)\n- [OpenCode V2 — configuração](https://opencode.ai/v2/docs/config)',
].join('\n\n')

function endpointSummary(endpoint: Endpoint) {
  const { method, path, description } = endpoint
  if (
    method === 'PATCH' &&
    (path.endsWith('/message/:messageId') || path.endsWith('/messages/:messageRecordId'))
  )
    return 'Editar mensagem de texto'
  if (path.endsWith('/contacts/:contactId/avatar')) return 'Atualizar foto do contato'
  if (path.endsWith('/contacts') || path.endsWith('/contacts/:contactId')) {
    return {
      GET: 'Listar contatos',
      POST: 'Salvar contato',
      PUT: 'Atualizar contato',
      PATCH: 'Atualizar contato',
      DELETE: 'Remover contato',
    }[method]
  }
  if (path.endsWith('/conversations/:conversationId/media')) return 'Listar mídias'
  if (path.endsWith('/library')) return 'Listar biblioteca de mídia, documentos e links'
  if (method === 'POST' && path.endsWith('/conversation-labels')) return 'Criar etiqueta'
  if (method === 'DELETE' && path.endsWith('/conversations/:conversationId'))
    return 'Excluir conversa'
  if (
    method === 'DELETE' &&
    path.endsWith('/conversations/:conversationId/messages/:messageRecordId')
  )
    return 'Remover mensagem'
  if (path.endsWith('/conversations/:conversationId/read')) return 'Atualizar leitura da conversa'
  if (path.endsWith('/conversations/:conversationId/read-state')) return 'Alterar estado de leitura'
  if (path.endsWith('/conversations/:conversationId/labels'))
    return 'Atualizar etiquetas da conversa'

  const messageTypes: Record<string, string> = {
    text: 'texto',
    image: 'imagem',
    video: 'vídeo',
    audio: 'áudio',
    document: 'documento',
    contact: 'contato',
    location: 'localização',
  }
  const messageType = path.match(
    /\/message\/(text|image|video|audio|document|contact|location)$/,
  )?.[1]
  if (method === 'POST' && messageType) return `Enviar mensagem de ${messageTypes[messageType]}`

  const actions: Record<string, string> = {
    'send-invite': 'Enviar convite para o grupo',
    add: 'Adicionar participantes',
    remove: 'Remover participantes',
    promote: 'Promover participantes',
    demote: 'Rebaixar participantes',
    'invite-code': 'Obter código de convite',
    'invite-code-revoke': 'Revogar código de convite',
    leave: 'Sair do grupo',
    'last-seen': 'Atualizar privacidade de visto por último',
    online: 'Atualizar privacidade online',
    'profile-picture': 'Atualizar privacidade da foto de perfil',
    status: 'Atualizar privacidade do status',
    'read-receipts': 'Atualizar confirmações de leitura',
    'groups-add': 'Atualizar privacidade de adição a grupos',
    'default-disappearing-mode': 'Atualizar mensagens temporárias',
    'update-profile-status': 'Atualizar recado do perfil',
    'update-profile-name': 'Atualizar nome do perfil',
    'block-contact': 'Bloquear contato',
    'unblock-contact': 'Desbloquear contato',
  }
  const segments = path.split('/')
  const action = segments.at(-1)?.startsWith(':') ? segments.at(-2) : segments.at(-1)
  if (action && actions[action]) return actions[action]

  return description
    .split(/[.,;]/, 1)[0]
    .replace(
      /^(Lista|Busca|Cria|Envia|Remove|Atualiza|Exclui|Obtém|Consulta|Verifica|Conecta|Desconecta|Arquiva|Desarquiva|Apaga|Avança|Marca|Substitui|Reenvia)/,
      (verb) => {
        const infinitives: Record<string, string> = {
          Lista: 'Listar',
          Busca: 'Buscar',
          Cria: 'Criar',
          Envia: 'Enviar',
          Remove: 'Remover',
          Atualiza: 'Atualizar',
          Exclui: 'Excluir',
          Obtém: 'Obter',
          Consulta: 'Consultar',
          Verifica: 'Verificar',
          Conecta: 'Conectar',
          Desconecta: 'Desconectar',
          Arquiva: 'Arquivar',
          Desarquiva: 'Desarquivar',
          Apaga: 'Apagar',
          Avança: 'Avançar',
          Marca: 'Marcar',
          Substitui: 'Substituir',
          Reenvia: 'Reenviar',
        }
        return infinitives[verb] ?? verb
      },
    )
}

export function describeApiRoute(method: string, path: string) {
  const endpoint = endpoints.find((entry) => entry.method === method && entry.path === path)
  if (!endpoint) throw new Error(`Missing API documentation: ${method} ${path}`)
  const group =
    path.startsWith('/admin/') && endpoint.group === 'Sessões'
      ? 'Sessões administrativas'
      : endpoint.group === 'Contatos e conversas'
        ? path.includes('/conversation-labels') || path.endsWith('/labels')
          ? 'Etiquetas'
          : path.includes('/contacts')
            ? 'Contatos'
            : 'Conversas'
        : endpoint.group
  const details = getRequestDetails(method, path)
  const querySchema = details.query ? z.toJSONSchema(details.query, { io: 'input' }) : undefined
  type Parameter = Extract<NonNullable<DescribeRouteOptions['parameters']>[number], { in: string }>
  const parameters: NonNullable<DescribeRouteOptions['parameters']> = [
    ...[...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
      name: match[1],
      in: 'path' as const,
      required: true,
      description: parameterExamples[match[1]]?.description,
      schema: { type: 'string' as const },
      example: parameterExamples[match[1]]?.value,
    })),
    ...Object.entries(details.query?.shape ?? {}).map(([name, schema]) => ({
      name,
      in: 'query' as const,
      required: querySchema?.required?.includes(name) ?? false,
      // Zod emits OpenAPI-compatible schemas, but exposes a wider JSON Schema type.
      schema: z.toJSONSchema(schema, {
        io: 'input',
        target: 'openapi-3.0',
      }) as Parameter['schema'],
      example: details.queryExample?.[name],
    })),
  ]
  const responses: NonNullable<DescribeRouteOptions['responses']> = {
    ...Object.fromEntries(
      (details.successStatuses ?? [200]).map((status) => [
        status,
        {
          description:
            status === 201 ? 'Recurso criado com sucesso.' : 'Operação concluída com sucesso.',
        },
      ]),
    ),
    default: {
      description: 'Erro da API. Os códigos disponíveis variam conforme a operação.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['ok', 'error'],
            properties: {
              ok: { type: 'boolean', const: false },
              error: {
                type: 'object',
                required: ['code', 'message'],
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }
  if (path.endsWith('/media/base64')) {
    responses[200] = {
      description: 'Mídia em base64.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['status', 'data'],
            properties: {
              status: { type: 'string', enum: ['success'] },
              data: {
                type: 'object',
                required: ['media', 'mimeType', 'fileName'],
                properties: {
                  media: { type: 'string', description: 'Conteúdo codificado em base64.' },
                  mimeType: { type: ['string', 'null'] },
                  fileName: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    }
  }
  if (path.endsWith('/content') || path.endsWith('/media/binary')) {
    const content = {
      'application/octet-stream': {
        schema: { type: 'string' as const, format: 'binary' },
      },
    }
    parameters.push({
      name: 'Range',
      in: 'header',
      schema: { type: 'string' },
      example: 'bytes=0-1023',
    })
    responses[200] = { description: 'Arquivo completo.', content }
    responses[206] = {
      description: 'Conteúdo parcial solicitado por Range.',
      content,
    }
    responses[416] = { description: 'Intervalo de bytes inválido.' }
  }
  const security: NonNullable<DescribeRouteOptions['security']> =
    endpoint.auth === 'admin' || endpoint.auth === 'user'
      ? [{ userApiKey: [] }, { cookieAuth: [] }]
      : endpoint.auth === 'session'
        ? [{ userApiKey: [] }, { cookieAuth: [] }]
        : []
  return describeRoute({
    summary: endpointSummary(endpoint),
    tags: [group],
    description: [
      endpoint.description,
      endpoint.auth === 'admin'
        ? 'Autenticação de integração: envie o header `x-api-key: SUA_API_KEY` com uma chave global de usuário com papel ADMIN. Não exige login ou cookies; não use `Authorization: Bearer`.'
        : endpoint.auth === 'user'
          ? 'Autenticação de integração: envie o header `x-api-key: SUA_API_KEY` com a chave do usuário. Não exige login ou cookies; não use `Authorization: Bearer`. O acesso respeita papel, propriedade e escopo da chave.'
          : endpoint.auth === 'session'
            ? 'Autenticação de integração: envie o header `x-api-key: SUA_API_KEY` com uma chave restrita à sessão indicada no path ou uma chave global autorizada. Não exige login ou cookies; não use `Authorization: Bearer`. O acesso respeita as permissões atuais do proprietário.'
            : 'Não exige autenticação.',
      details.notes,
      paginationDocumentation(details.pagination),
    ]
      .filter(Boolean)
      .join('\n\n'),
    parameters,
    security,
    ...(details.body
      ? {
          requestBody: {
            required: true,
            content: {
              [details.multipart ? 'multipart/form-data' : 'application/json']: {
                schema: resolver(details.body, { io: 'input' }),
                example: details.example,
              },
            },
          },
        }
      : {}),
    responses,
  })
}
