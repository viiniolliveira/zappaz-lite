# API de integração

A API do Zappaz Lite fica em `server/`, com base local padrão `http://localhost:3001`. Este guia cobre autenticação, sessões WhatsApp, envio por número, grupos, privacidade, webhooks e administração.

Os contratos REST usados pelo chat estão separados por domínio: [contatos](chat/contacts.md), [conversas](chat/conversations.md), [etiquetas](chat/labels.md), [mensagens](chat/messages.md) e [mídias](chat/media.md). A separação é documental: as rotas continuam sob `/api/v1/session/:sessionId` e preservam suas permissões.

## Como autenticar uma integração

Envie **`x-api-key: SUA_API_KEY` em cada requisição**. Não é necessário fazer login nem obter/enviar cookies do Better Auth para usar a API de integração.

1. Na interface, abra **Chaves de API** e crie uma chave, global ou restrita à sessão desejada.
2. Guarde o segredo exibido na criação e use-o somente no servidor da integração.
3. Envie o valor diretamente no header `x-api-key`, sem o prefixo `Bearer`. Não use `Authorization: Bearer`.

```sh
curl 'https://zappaz.example.com/api/v1/session/ID_DA_SESSAO/webhook' \
  -H 'x-api-key: SUA_API_KEY'
```

Substitua o domínio pela URL da sua instalação e o ID pela sessão autorizada. Chaves restritas acessam apenas a sessão escolhida; operações globais exigem chave global, e operações administrativas exigem também papel `ADMIN`. Os endpoints nativos `/api/auth/*` de conta, chaves e usuários são usados pela interface e exigem cookie de login; não fazem parte desse fluxo de integração.

## Endpoints principais

```text
POST /api/v1/session/:sessionId/connect
POST /api/v1/session/:sessionId/message/text
POST /api/v1/session/:sessionId/message/image
PATCH /api/v1/session/:sessionId/message/:messageId
GET  /api/v1/session/:sessionId/messages
GET  /api/v1/session/:sessionId/messages/:messageId
GET  /api/v1/session/:sessionId/webhook
POST /api/v1/session/:sessionId/webhook
POST /mcp
```

Nas rotas com limitador geral, o limite é de **100 requisições a cada 5 segundos** por IP do transporte. Better Auth limita login a **5 tentativas a cada 10 minutos** em produção. `X-Forwarded-For` não é usado; `X-Real-IP` só é confiável com `TRUST_PROXY=true` e acesso restrito ao proxy. Ao receber 429, respeite `Retry-After`.

Clientes de IA podem usar o [MCP integrado](mcp.md), com ferramentas de mensagens, grupos e webhooks no mesmo processo. Eventos externos estão em [payloads dos webhooks WhatsApp](webhook-payloads.md); eventos da interface, em [realtime](realtime.md).

## Referência interativa e OpenAPI

Acesse **`/docs`** para abrir o Scalar; a interface pode usar a sessão de login para abrir essa página. Para baixar **`/openapi.json`** por uma integração, envie `x-api-key` com uma chave global autorizada. Ambas as rotas são privadas (`Cache-Control: private, no-store`).

A referência organiza as rotas em **API** (integração WhatsApp), **Chat** (contatos, conversas, etiquetas e mensagens) e **Admin** (incluindo gerenciamento de usuários). Rotas de autenticação e conta não aparecem no Scalar nem no OpenAPI, mas continuam disponíveis conforme suas permissões. Não há referência pública separada em `/api/auth/reference`. A página inclui a especificação no HTML autenticado, sem expor credenciais.

Cada operação inclui autenticação, params obrigatórios com exemplos, query, body, cURL e paginação. Schemas derivam dos Zod das rotas: `required`, `default`, `enum`, `minLength`, `maxLength`, `minimum` e `maximum` descrevem campos/limites. Refinamentos adicionais (como exclusão entre `before`/`after`) ficam nas notas. File e refinamentos customizados não são totalmente representáveis em JSON Schema; consulte multipart/notas da operação.

No Scalar, abra **Authentication**, selecione **`userApiKey`** e cole somente o valor da chave. O visualizador envia `x-api-key` automaticamente; não é necessário configurar cookies para testar integrações. Use uma chave global ou restrita à sessão, conforme a operação. Chamadas vão diretamente ao servidor atual, sem proxy; JavaScript do visualizador vem do CDN Scalar.

Metadados são anexados com `describeApiRoute` (helper de `describeRoute`) em `server/src/modules/docs/openapi.ts`; schemas/exemplos reutilizáveis ficam em `requests.ts`. Ao adicionar rota, registre metadados/schemas e middleware de documentação. Especificação é gerada das rotas, não de arquivo estático.

A seção **Payloads dos webhooks** apresenta envelope `event/payload/session`, respostas `replyTo`, mídia/miniaturas, status, reações, recibos, PN/LID, campos opcionais, downloads e reenvios. Veja [contrato dos webhooks](webhook-payloads.md).

### Webhooks de sessão pelo MCP

O MCP oferece `get_webhooks`, `create_webhook`, `update_webhook` e `delete_webhook` para webhooks de sessão, inclusive com WhatsApp desconectado. Autentique com `x-api-key: SUA_API_KEY`: o preset `user` exige chave global e recebe `sessionId` nas ferramentas. No preset `session`, a sessão vem de `x-zappaz-session-id`; use chave restrita à sessão ou global autorizada. Os presets não concedem acesso a webhooks globais. Consulte [presets e exemplos MCP](mcp.md#webhooks-por-preset).

### Webhooks globais (administrador)

- `GET /admin/webhook`: todos os webhooks globais em array, sem paginação.
- `POST /admin/webhook`: cria (201).
- `PUT /admin/webhook/:webhookId`: atualiza.
- `DELETE /admin/webhook/:webhookId`: remove.

Envie `x-api-key: SUA_API_KEY` com uma chave global de administrador; usuários comuns e chaves restritas não dão acesso. Webhooks globais habilitados recebem eventos selecionados de todas as sessões. `enabled` default `false`; eventos omitidos recebem `false`, então envie a configuração completa pretendida. Webhooks de sessão permanecem em `/api/v1/session/:sessionId/webhook`.

## Consultar mensagens persistidas

`GET /api/v1/session/:sessionId/messages` lista mensagens persistidas, sem grupos. Aceita filtros opcionais `conversationId` (UUID), `phoneNumber` (somente dígitos com DDI, até 15), `lid` (JID completo `12345@lid`) e `jid` (JID completo PN ou LID). Filtros combinados usam AND: todos precisam corresponder à mesma conversa. A identidade PN/LID é resolvida pelo cadastro interno persistido na sessão, sem inferir telefone de LID nem criar contatos.

Toda listagem é paginada: `limit` de 1 a 100 (padrão 50) e `before` ou `after`, mutuamente exclusivos. Sem filtro de conversa, lista a sessão. Resposta `{status:"success",data:MessageDTO[],page:{hasMore,nextCursor},boundaries:{first,last}}`. Cursores são vinculados à sessão e aos filtros e não podem ser reutilizados em outra consulta. Não há filtro `type`. Ordenação e cursores seguem o [histórico de mensagens](chat/messages.md).

`GET /api/v1/session/:sessionId/messages/:messageId` busca pelo **ID WhatsApp**, exigindo ao menos um dos filtros de conversa acima. Retorna `{status:"success",data:MessageDTO}` ou 404 se não houver mensagem nesse escopo. Parâmetros inválidos seguem o erro de validação padrão.

```text
GET /api/v1/session/minha-sessao/messages?phoneNumber=5511999999999&limit=50
GET /api/v1/session/minha-sessao/messages/ABC123?jid=5511999999999%40s.whatsapp.net
```

Os dois endpoints exigem autenticação/autorização da sessão, mas não WhatsApp conectado. Reutilizam o [DTO de mensagem existente](chat/messages.md), sem alterar o histórico por conversa ou o GET por `messageRecordId` (UUID interno). No webhook, `message.id` e `message.conversationId`, quando não nulos, permitem acessar diretamente os endpoints atuais; veja [payloads](webhook-payloads.md).

## Editar mensagem de texto

`PATCH /api/v1/session/:sessionId/message/:messageId` edita o texto de uma mensagem própria já persistida. `messageId` é o **ID WhatsApp da mensagem original**, não seu UUID interno. Envie `x-api-key: SUA_API_KEY` com uma chave global ou restrita à sessão autorizada; exige sessão habilitada e conectada.

```sh
curl -X PATCH 'http://localhost:3001/api/v1/session/ID_DA_SESSAO/message/ID_WHATSAPP' \
  -H 'x-api-key: SUA_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Olá! Texto atualizado."}'
```

O body aceita somente `text`: 1–65.536 caracteres, não apenas espaços; espaços e quebras de linha são preservados. Envie o texto completo, incluindo a assinatura caso queira mantê-la: a edição não reaplica a assinatura da sessão. Permite texto simples e respostas de texto, preservando a citação. Não permite mensagens recebidas, removidas, mídias/legendas ou templates interativos. As restrições de edição do WhatsApp continuam aplicáveis.

Retorna HTTP 200 com `{status:"success",data:MessageDTO}` da mensagem original atualizada (`id`, `messageId`, `text`, `editedAt`, `revision` e demais campos do [contrato do chat](chat/messages.md)). Não cria nova mensagem nem altera o horário original. A alteração é persistida e notifica o chat via Socket.IO. Texto inalterado não gera novo envio.

Erros: 400 para entrada inválida; 403 para mensagem de outra autoria; 404 para ID inexistente na sessão; 409 para conteúdo não editável, sessão indisponível ou ID WhatsApp ambíguo em mais de uma conversa; 502 quando o envio da edição não puder ser confirmado. Falhas não devem disparar repetição automática; consulte o histórico antes de tentar novamente. A confirmação do envio Baileys não garante aceitação final pelo destinatário/WhatsApp.

Para o UUID interno e a interface, consulte [edição no chat](chat/messages.md#edição-de-texto).
No MCP, a mesma operação está disponível como [`edit_message`](mcp.md#editar-mensagens) nos presets `session` e `user`.

## Autenticação

### Login da interface, minha conta e administração de usuários

- Hono encaminha `/api/auth/*` ao handler oficial Better Auth.
- `POST /api/auth/sign-in/email` e `/sign-out`: login `{email,password}` e logout com revogação no banco. Cookie HttpOnly, Secure em produção; sessão de 24h com renovação nativa, sem cookie cache.
- `GET /api/auth/get-session`: `{session,user}`. `POST /api/auth/update-user` aceita só `name`, `lastName`, `phone`; `POST /api/auth/change-email` recebe `{newEmail}`. Nome 1–100 caracteres; telefone 7–15 dígitos sem `+`. Primeiro nome e sobrenome permanecem separados.
- `POST /api/auth/change-password`: `{currentPassword,newPassword,revokeOtherSessions:true}`. Senha atual obrigatória, nova de 8–128 caracteres; servidor sempre revoga outros logins. Hash scrypt nativo, sem hash adicional no navegador.
- Plugin admin: GET `/api/auth/admin/list-users`; POST `/create-user`, `/update-user`, `/set-role`, `/set-user-password`, `/remove-user` sob `/api/auth/admin`. Perfis `ADMIN`/`USER`. Reset administrativo de senha revoga logins do alvo.
- Listagem usa `limit`, `offset` e filtros Better Auth. Cadastro `{email,password,name,role,data:{lastName,phone}}`; edição `{userId,data:{name,lastName,email,phone}}`; perfil `{userId,role}`; senha `{userId,newPassword}`; exclusão `{userId}`.
- `phone` é opcional/aceita `null` na criação/edição administrativa; preenchido exige 7–15 dígitos. Omitir na edição preserva; `null` remove. Formulários permitem salvar sem telefone.
- Exclusão encerra acessos, desconecta WhatsApp e limpa mídias/estado Baileys antes de remover usuário. Falha mantém conta bloqueada para repetir. Banco impede remover, bloquear ou rebaixar último admin, inclusive concorrentemente.
- Recuperação usa `ADMIN_RESET_PASSWORD=true`, conforme [deploy](deployment.md); sem endpoint de token temporário.
- Só esses endpoints Better Auth são expostos. Cadastro público, banimento manual, impersonação, recuperação de senha e gerenciamento avulso de sessões estão desabilitados.

`/account` contém formulários da própria conta; `/users` é restrita a administradores na navegação e acesso direto. APIs verificam permissões independentemente da interface.

```sh
curl -c cookies.txt -X POST 'http://localhost:3001/api/auth/sign-in/email' \
  -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"SUBSTITUA_A_SENHA"}'
```

Cookie autentica APIs de usuário/admin; envie `Origin` confiável em escritas. Nas escritas nativas de autenticação, incluindo login sem cookie, um `Origin` explícito fora da allowlist é rejeitado. Clientes não browser podem fazer login sem `Origin` e sem cookie; isso não dispensa origem em escritas com cookie. API Keys autenticam integrações por `x-api-key`, sem exigir Origin. JWTs de sessão não são aceitos. Logout preserva API Keys; alteração/reset de senha revoga todas as chaves do usuário. Socket.IO revalida acesso durante conexão. `X-Realtime-Socket-Id` evita invalidação redundante na origem, sem conceder autorização.

### API Keys do usuário

Na página **Chaves de API** (`/api-keys`), acessível pelo menu lateral, crie várias chaves independentes pelo botão **Nova chave**. O modal oferece 1 hora, 1, 7, 30, 90 ou 180 dias, 1 ano e **Sem expiração**; 90 dias vem selecionado por padrão. A opção sem expiração é explícita e alerta que a chave permanece válida até revogação.

A criação segue Nome → Acesso → Validade. Selecione **Global** ou uma sessão pelo nome. A tabela exibe escopo, início da chave, criação, expiração, último uso e status. Revogação individual exige confirmação e não afeta outras chaves. O segredo aparece somente na criação; armazene-o com segurança.

- `POST /api/auth/api-key/create`: `{name, metadata, expiresIn}`. `metadata` obrigatório: `{scope:"global"}` ou `{scope:"session",sessionId:"ID"}`. Validade em segundos, de 3600 a 31536000; `null` ou omitido significa sem expiração. O padrão de 90 dias é da interface.
- `GET /api/auth/api-key/list`: lista somente as chaves do usuário logado, sem os segredos.
- `POST /api/auth/api-key/delete`: `{keyId}`; revoga somente uma chave do próprio usuário.

Esses endpoints exigem cookie de login e verificam propriedade. Os demais endpoints nativos Better Auth de conta, senha e usuários também preservam a exigência de login real; não habilitamos sessões simuladas por chave. API Keys não criam outras chaves e não substituem os requisitos de segurança do Better Auth.

Nas rotas da aplicação, envie `x-api-key: SUA_CHAVE`. Chaves globais acessam todas as sessões permitidas ao proprietário, inclusive futuras, sem elevar seu papel. Chaves restritas acessam apenas a sessão selecionada, não criam sessões, não acessam operações globais/admin e exigem preset MCP `session`. Listagem e total são filtrados pelo escopo. O servidor valida a seleção e grava permissões nativas Better Auth (`{global:["sessions"]}` ou `{sessions:["ID"]}`); permissões ausentes/inválidas não autorizam acesso. Papel, bloqueio e propriedade são revalidados. O banco armazena somente o hash do segredo.

Cada chave tem limite de **120 verificações por minuto**, além dos limites gerais por IP. Chave inválida, desabilitada, expirada ou revogada não autentica; limite excedido retorna 429. Quando `x-api-key` é enviado, não há fallback para cookie/JWT em caso de erro. Não envie credenciais na URL.

## Segredo e headers dos webhooks

Webhooks de sessão e globais aceitam `secret` opcional: uma string de 1–2.048 caracteres ASCII visíveis, sem espaços. Quando configurado, o Zappaz envia `X-Zappaz-Webhook-Secret` com esse valor. As respostas autorizadas de criação, listagem, consulta e edição retornam `secret` com o valor ou `null`: trate essas respostas como credenciais e não as registre em logs. Na edição, omitir `secret` preserva o atual; uma string o substitui e `null` o remove. O segredo é armazenado no banco como valor recuperável, pois precisa ser enviado em cada entrega; proteja o acesso ao banco e seus backups.

`headers` aceita até 20 headers adicionais. O nome `X-Zappaz-Webhook-Secret` é reservado, independentemente de maiúsculas e minúsculas, e não pode ser informado em `headers`. Os valores de headers adicionais continuam retornados nas respostas de configuração para permitir sua edição: não coloque valores dessas respostas em logs e restrinja o acesso. O retry usa os headers e o segredo atualmente configurados. O receptor deve validar o segredo antes de processar eventos, usando HTTPS. Esse header não é uma assinatura do corpo e não impede replay por si só.

Para verificar o isolamento com autenticação real, execute `bun --no-env-file test ./test/security/authorization-postgres.test.ts`. A integração usa PostgreSQL descartável em Docker, credenciais sintéticas e arquivos temporários; não usa o banco de desenvolvimento nem conecta ao WhatsApp. Ela cobre cenários específicos de autorização e não substitui uma auditoria de segurança.

```sh
curl 'http://localhost:3001/api/v1/session' \
  -H 'x-api-key: SUA_CHAVE'
```

A interface espera cookie HttpOnly, CORS com credentials e origem explícita em `Access-Control-Allow-Origin`. O guard consulta `GET /api/v1/session`. Organização dos clientes HTTP está em [frontend](frontend.md#autenticação).

## Params, query e body

- Envios confirmados pela API ou pelo chat emitem `messages.send` para os webhooks habilitados e inscritos nesse evento. O evento `outbound-message.upsert` é independente e pode ser recebido quando o WhatsApp informa uma mensagem própria.
- Params substituem `:sessionId` etc.; codifique valores na URL.
- Query vai na URL; JSON exige `Content-Type: application/json`.
- Operações sem body estão identificadas como **Sem body**; não envie `{}` desnecessariamente.
- `POST /api/v1/session/:sessionId/message/image` recebe JSON com `number`, `source` e opcionais como `caption`, não multipart.

```sh
curl -X POST 'http://localhost:3001/api/v1/session/ID_DA_SESSAO/message/image' \
  -H 'x-api-key: SUA_CHAVE' \
  -H 'Content-Type: application/json' \
  -d '{"number":"5511999999999","source":"https://example.com/foto.jpg","caption":"Foto do produto"}'
```

Upload binário vinculado a uma conversa tem [contrato próprio de mídia do chat](chat/media.md#upload-e-limites).

### Envio de contato

`POST /api/v1/session/:sessionId/message/contact` recebe `number` e `contact` com `firstName`, `lastName` e `phoneNumber`; `displayName`, `organization`, `email` e `url` são opcionais. O servidor gera vCard 3.0 no formato de contatos do Baileys. Sem `displayName`, o campo `FN` usa nome e sobrenome, como o nome do envelope. Nomes, organização e email escapam barras invertidas, quebras de linha, vírgulas e ponto e vírgula para não criar campos adicionais.

O telefone deve resolver para um JID de número (`@s.whatsapp.net`), nunca grupo ou LID. URLs são preservadas como URI, mas quebras de linha nelas são rejeitadas com HTTP 400. Isso não salva o contato na agenda local nem altera contatos no WhatsApp.

## Assinatura de mensagens de texto

A configuração da sessão inclui `signatureEnabled` (padrão `false`) e `signatureName` (padrão `""`). Defina o nome e a ativação em `config` ao criar ou atualizar a sessão; os dois campos são retornados nas consultas públicas. Ativar sem um nome preenchido retorna 400. O nome recebe trim, aceita até 100 caracteres e deve ocupar uma única linha.

```json
{"config":{"signatureName":"Lucas - Financeiro","signatureEnabled":true}}
```

`POST /api/v1/session/:sessionId/message/text` e a ferramenta MCP `send_text_message` aceitam `signMessage?: boolean` e `signatureName?: string` junto dos campos de texto existentes:

```json
{"number":"5511999999999","message":"Olá, como posso te ajudar?","signMessage":true,"signatureName":"Lucas - Financeiro"}
```

Campos omitidos herdam os valores da sessão. `signMessage:false` sempre envia sem assinatura. `signatureName` sobrescreve somente o nome, não ativa a assinatura implicitamente; quando informado, deve estar preenchido. Sobrescritas valem apenas para aquele envio, sem alterar a configuração. Assinatura ativa exige um nome válido, inclusive quando ativada pelo payload.

O texto enviado fica `*Lucas - Financeiro:*\nOlá, como posso te ajudar?`, com os dois-pontos adicionados automaticamente após o nome. A assinatura é aplicada no backend antes do envio e da persistência. Não se aplica a legendas, mídias ou anexos. O [compositor do chat](chat/messages.md#assinatura) compartilha a mesma configuração.

## Paginação por página

Usada em sessões (`GET /api/v1/session`, `GET /admin/session`), webhooks de sessão e logs de webhook. Usuários usam `limit`/`offset` Better Auth.

```text
Primeira página: ?page=1&pageSize=20
Segunda página:  ?page=2&pageSize=20
```

```json
{"status":"success","data":[],"page":"1","pageSize":"20","total":0}
```

Defaults `page=1`, `pageSize=100`. Preserve filtros; pare quando `page * pageSize >= total`. Resposta usa strings em `page`/`pageSize`; entrada é convertida em números para sessões/webhooks.

| Listagem | Filtros adicionais |
| --- | --- |
| Sessões | `archived=true`/`false` (default `false`) |
| Logs | `event`, `status` (HTTP do destino), `startDate`, `endDate` (ISO 8601) |

Listas de grupos e histórico agregado de envios não usam cursor do chat. Histórico agregado aceita `startDate`, `endDate`, `granularity=day|week|month` (default `day`), não `page` nem `cursor`.

Paginação por cursor é documentada em [contatos](chat/contacts.md#paginação), [conversas](chat/conversations.md#abertura-e-listagem), [histórico de mensagens](chat/messages.md#histórico-e-paginação) e [mídias](chat/media.md#listagem-de-mídias).

## Downloads, realtime e erros

- `GET /api/v1/session/:sessionId/message/:messageId/media/base64`: retorna JSON `{ "status": "success", "data": { "media": "<base64>", "mimeType": "image/jpeg", "fileName": null } }`.
- `GET /api/v1/session/:sessionId/message/:messageId/media/binary`: retorna os bytes do arquivo, com suporte a `Range` (200/206; intervalo inválido: 416). Tipos seguros para exibição usam seu MIME; outros são retornados como `application/octet-stream` para download.

Em ambas, `messageId` é o ID WhatsApp, diferente do UUID interno `messageRecordId`. A mídia persistida é reutilizada quando disponível; caso contrário, é baixada pelo WhatsApp, com sessão habilitada e conectada. Veja [payloads de mídia](webhook-payloads.md#mídia).
- O chat usa [download binário escopado por conversa](chat/media.md#persistência-miniaturas-e-downloads).
- Logs ao vivo usam `logs.subscribe`/`logs.entry` no Socket.IO `/api/ws`; SSE foi removido. Veja [realtime](realtime.md#logs-ao-vivo).
- Erros seguem `{ "ok": false, "error": { "code": "...", "message": "...", "issues": [] } }`. `issues` é opcional e aparece na validação Zod. Códigos dependem da operação: 400, 401, 403, 404, 409, 413, 416, 429 ou 500. Respeite `Retry-After` em 429.

## Sincronização de histórico

Configuração de sessão `syncFullHistory` default `false`, alterável em Detalhes da sessão → Configurações. Valores explícitos são respeitados; mudança afeta próxima conexão, sem garantir reenvio pelo WhatsApp. Progresso e diagnóstico estão em [sincronização do chat](chat/realtime.md#sincronização-de-histórico).

## Exclusão definitiva de sessão

`DELETE /admin/session/:sessionId/remove` encerra/exclui sessão, dados relacionados, credenciais Baileys, logs e mídias. Exige admin; botão “Deletar Sessão” usa essa rota. Remove pasta/prefixo inteiro, raiz local vazia, órfãos e mídias de conversas já excluídas, mesmo com persistência desativada. Falha de storage retorna `STORAGE_UNAVAILABLE` (503), mantendo sessão desativada e metadados para repetir; arquivos removidos não são restaurados. Sucesso remove também registros de limpeza. Não apaga conversas no WhatsApp.

`PUT /api/v1/session/:sessionId/logout` desvincula WhatsApp e limpa credenciais, mensagens, miniaturas e pasta/prefixo de mídias, preservando cadastro e contatos locais. `loggedOut` do WhatsApp faz a mesma limpeza. Aceita sessão desconectada para repetir falhas. Outras desconexões, bloqueios, rede, reinícios e limite de QR preservam mensagens/mídias.

Detalhes técnicos dos locks e limpeza estão em [backend](backend.md#limpeza-no-logout-e-na-exclusão-de-sessão).
# Segurança das URLs externas

Webhooks, retry, URLs de mídia para envio e fotos usam o transporte protegido: somente HTTP/HTTPS sem credenciais e destinos públicos. Redes privadas/reservadas e DNS com qualquer resposta não pública são rejeitados na conexão. Não são seguidos redirecionamentos e proxies de ambiente são ignorados. Destinos internos não são suportados. URLs de mídia para envio são baixadas uma única vez pelo transporte protegido; prévias de links usam esse transporte e não baixam imagens externas. Limites: 15 segundos totais por requisição e resposta de mídia limitada por `MEDIA_MAX_FILE_SIZE_MB` (padrão 25 MiB; HTML de prévias mantém 1 MiB). Fontes base64 respeitam o mesmo limite pelos bytes decodificados. A recuperação de [mídias recebidas](chat/media.md#persistência-miniaturas-e-downloads) usa o download oficial do Baileys, não esse transporte Axios; consulte no guia as limitações de segurança desse fluxo.

Corpos HTTP/MCP têm teto global derivado de `MEDIA_MAX_FILE_SIZE_MB`: `4 × ceil(limiteEmBytes / 3) + 1 MiB`, para expansão base64 e metadados (auth/chat podem ter limites menores). Paginação: 1–100 itens e até 10.000 páginas. Quotas: 20 sessões/usuário, 100 webhooks/usuário, 20/sessão e 50 globais. Capacidade externa: 16 requisições simultâneas por processo, sem fila; excesso retorna erro de limite. Webhooks têm teto de resposta de 64 KiB e logs não armazenam o corpo da resposta. Menções: 100; delay: 0–10.000 ms; texto: 65.536 caracteres; legenda: 4.096; headers: 20 valores de até 2.048 caracteres, sem sobrescrever headers de transporte. O proxy só pode fornecer `x-real-ip` quando `TRUST_PROXY` está habilitado e o backend deve estar inacessível diretamente por clientes não confiáveis.

A proteção global não acumula o corpo antes da autenticação da rota: a leitura ocorre sob demanda, com verificação dos bytes reais mesmo sem `Content-Length` ou com valor subestimado. Há até quatro leitores de corpo simultâneos por processo, sem fila, e prazo total de 15 segundos a partir da primeira leitura. O teto de `/api/auth/*` é 16 KiB. Excesso de tamanho retorna `413`, capacidade de leitura esgotada retorna `429` e prazo de leitura excedido retorna `408` (`REQUEST_TIMEOUT`). O prazo de leitura não é um timeout geral de execução da operação. No MCP, envie uma mensagem por POST; arrays de batch são rejeitados antes do despacho de ferramentas.

Respostas de sessão HTTP/MCP usam uma projeção pública explícita, sem tokens, segredos ou credenciais Baileys.

A autenticação de integração é exclusivamente por API Key Better Auth. Os campos JWT/segredo, endpoint de rotação e card de token foram removidos. Crie/revogue chaves na página Chaves de API. HTTP/MCP revalidam na próxima requisição; Socket.IO revalida em até 15 segundos. Alteração/reset de senha revoga as chaves; bloqueio impede autorização; exclusão da conta remove as chaves em cascata. Chaves sem escopo explícito devem ser recriadas, não recebem acesso global por padrão.
