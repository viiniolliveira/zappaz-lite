# MCP integrado

O módulo `server/src/modules/mcp/` usa o SDK oficial v2 (`@modelcontextprotocol/server` e `@modelcontextprotocol/hono`) para expor **Streamable HTTP** na mesma API Hono, porta 3001. Não usa Mastra, subprocesso Python, HTTP interno ou servidor adicional.

## Conexão

```text
http://localhost:3001/mcp
x-api-key: SUA_CHAVE
x-zappaz-preset: session
x-zappaz-session-id: ID_DA_SESSAO
```

No preset `session`, use `x-api-key: SUA_CHAVE` com uma chave restrita à sessão ou global autorizada. O header `x-zappaz-session-id` vincula as ferramentas à sessão indicada. Cookies também são aceitos, exigindo Origin confiável nas escritas. JWTs não são aceitos.

No preset `user`, envie `x-zappaz-preset: user` e uma chave global em `x-api-key` ou cookie autenticado. Não envie o header de sessão: ferramentas recebem `sessionId`, e ferramentas adicionais gerenciam sessões acessíveis. Chaves restritas não autorizam este preset. Cada requisição revalida autenticação e permissões; o servidor MCP é criado por request. Repita os headers em todas as chamadas.

Envie uma única mensagem MCP por POST. Batches JSON-RPC (arrays) retornam `400` antes da criação do servidor ou execução de ferramentas, evitando multiplicar operações sob uma única admissão HTTP. Chamadas individuais continuam usando o SDK oficial. Os limites de corpo, concorrência de leitura e prazo são compartilhados com HTTP; consulte [proteções e limites da API](api.md#segurança-das-urls-externas).

A sintaxe varia por cliente. Use os exemplos abaixo, também disponíveis no Scalar em `/docs`. Em produção use HTTPS e guarde a chave como segredo do cliente. Não há descoberta OAuth ou registro dinâmico de clientes: configure `x-api-key` explicitamente.

Para o preset `user`, configure os headers `x-zappaz-preset: user` e `x-api-key: SUA_CHAVE`, sem header de sessão. Por exemplo, no OpenCode v2:

```json
{
  "mcp": { "servers": { "zappaz": {
    "type": "remote",
    "url": "http://localhost:3001/mcp",
    "oauth": false,
    "headers": { "x-zappaz-preset": "user", "x-api-key": "{env:ZAPPAZ_API_KEY}" }
  } } }
}
```

## Antes de configurar

1. Inicie a aplicação pelo [setup do README](../README.md#setup-local) ou pelo Docker Compose.
2. Na página **Chaves de API**, crie uma chave global ou selecione uma sessão no campo Acesso. Copie a chave, exibida apenas uma vez.
3. Substitua `ID_DA_SESSAO` e `SUA_CHAVE` pelos valores correspondentes; use `ZAPPAZ_API_KEY` no ambiente dos clientes com suporte a variáveis.
4. Use a origem da API, normalmente `http://localhost:3001`. Em produção, use `https://zappaz.example.com/mcp`, com o domínio configurado em `APP_URL`; as proteções de Host/Origin são derivadas dele.

Os exemplos abaixo contêm placeholders, nunca credenciais reais. Não commite configurações com tokens preenchidos. Quando o cliente permitir, use variáveis de ambiente ou armazenamento de segredos. Variáveis do cliente devem estar disponíveis no processo do editor/CLI; o `.env` da API não é automaticamente carregado por esses programas.

## Configuração por cliente

- [OpenCode v2](#opencode-v2)
- [Codex CLI e extensão IDE](#codex-cli-e-extensão-ide)
- [Cursor](#cursor)
- [Antigravity](#antigravity)
- [VS Code](#vs-code)
- [Claude Code](#claude-code)
- [Claude web e Desktop com conector remoto](#claude-web-e-desktop-com-conector-remoto)
- [Claude Desktop e clientes stdio](#claude-desktop-e-clientes-stdio)
- [Windsurf](#windsurf)

### OpenCode v2

Adicione em `opencode.json` ou `opencode.jsonc`, preservando as demais configurações. Defina `ZAPPAZ_API_KEY` no ambiente que inicia o OpenCode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "zappaz": {
        "type": "remote",
        "url": "http://localhost:3001/mcp",
        "oauth": false,
        "protocol": "auto",
        "headers": {
          "x-api-key": "{env:ZAPPAZ_API_KEY}",
          "x-zappaz-preset": "session",
          "x-zappaz-session-id": "ID_DA_SESSAO"
        }
      }
    }
  }
}
```

Para uso pessoal em todos os projetos, o arquivo global é `~/.config/opencode/opencode.json(c)`. Verifique com `opencode mcp list` ou `/mcps`. O OpenCode recarrega a configuração ao salvar, sem reinício; `/reload` força uma recarga completa. O exemplo usa o formato **v2** (`mcp.servers`), não nomes de servidores diretamente em `mcp`; `oauth: false` evita tentar um login OAuth inexistente neste servidor. `protocol: "auto"` negocia a revisão suportada pelo SDK v2 e permite fallback para o handshake anterior. Variáveis usam `{env:NOME}`, não `$NOME` ou `${NOME}`.

### Codex CLI e extensão IDE

Adicione a tabela a `~/.codex/config.toml` para uso pessoal ou `.codex/config.toml` para um projeto confiável. Preserve as outras tabelas e defina `ZAPPAZ_API_KEY` no ambiente do cliente:

```toml
[mcp_servers.zappaz]
url = "http://localhost:3001/mcp"
env_http_headers = { "x-api-key" = "ZAPPAZ_API_KEY" }
http_headers = { "x-zappaz-preset" = "session", "x-zappaz-session-id" = "ID_DA_SESSAO" }
```

`env_http_headers` associa o header ao nome da variável. Não grave a chave no arquivo. Confira com `codex mcp list` e `/mcp`. Não execute `codex mcp login zappaz`, pois esse comando é para OAuth.

### Cursor

Adicione ao arquivo `.cursor/mcp.json` do projeto ou a `~/.cursor/mcp.json` para uso pessoal:

```json
{
  "mcpServers": {
    "zappaz": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "x-api-key": "SUA_CHAVE",
        "x-zappaz-preset": "session",
        "x-zappaz-session-id": "ID_DA_SESSAO"
      }
    }
  }
}
```

Abra as configurações de MCP do Cursor e confira o estado da conexão. Se preencher o token em um arquivo de projeto, mantenha esse arquivo fora do controle de versão.

### Antigravity

No painel do agente, abra **MCP Servers → Manage MCP Servers → View raw config** e adicione a entrada abaixo. O campo da URL neste formato é `serverUrl`:

```json
{
  "mcpServers": {
    "zappaz": {
      "serverUrl": "http://localhost:3001/mcp",
      "headers": {
        "x-api-key": "SUA_CHAVE",
        "x-zappaz-preset": "session",
        "x-zappaz-session-id": "ID_DA_SESSAO"
      }
    }
  }
}
```

Esse é o formato de configuração utilizado no [repositório Python de referência](https://github.com/ellion-agency/zappaz-mcp#configuracao-no-antigravity); os nomes dos menus podem variar conforme a versão do cliente.

### VS Code

Para o formato de workspace do VS Code, crie `.vscode/mcp.json`. Defina `ZAPPAZ_API_KEY` no ambiente do VS Code; em WSL, SSH ou containers, disponibilize-a no ambiente remoto.

```json
{
  "servers": {
    "zappaz": {
      "type": "http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "x-api-key": "${env:ZAPPAZ_API_KEY}",
        "x-zappaz-preset": "session",
        "x-zappaz-session-id": "ID_DA_SESSAO"
      }
    }
  }
}
```

Use **MCP: List Servers** na Command Palette para iniciar/verificar a conexão. O tipo correto é `http`, não `remote`.

Para o formato portátil `.mcp.json` (por exemplo, Copilot), use a entrada HTTP sob `mcpServers` e `${ZAPPAZ_API_KEY}` no header, em vez de `servers` e `${env:ZAPPAZ_API_KEY}`. Não use prompts `${input:...}` nesse formato.

### Claude Code

No terminal, registre o endpoint HTTP:

```bash
claude mcp add --transport http --scope user zappaz \
  'http://localhost:3001/mcp' \
  --header 'x-api-key: ${ZAPPAZ_API_KEY}' \
  --header 'x-zappaz-preset: session' \
  --header 'x-zappaz-session-id: ID_DA_SESSAO'
```

O comando salva a configuração do usuário, disponível em todos os projetos (`--scope local` limita ao projeto; `--scope project` escreve em `.mcp.json`). As aspas simples preservam a referência sem expandir a chave no comando. Não insira credenciais reais no histórico do shell. Como alternativa, use `.mcp.json` com `ZAPPAZ_API_KEY` no ambiente do Claude Code:

```json
{
  "mcpServers": {
    "zappaz": {
      "type": "http",
      "url": "http://localhost:3001/mcp",
      "headers": {
        "x-api-key": "${ZAPPAZ_API_KEY}",
        "x-zappaz-preset": "session",
        "x-zappaz-session-id": "ID_DA_SESSAO"
      }
    }
  }
}
```

Aprove a confiança no projeto e a configuração MCP quando solicitado. Confira com `claude mcp list`, `claude mcp get zappaz` ou `/mcp`. `type: "http"` é obrigatório. O Claude Code expande `${ZAPPAZ_API_KEY}`. Escolha o comando de usuário ou o arquivo de projeto para evitar definições concorrentes.

### Claude web e Desktop com conector remoto

Este fluxo é diferente do Claude Code e da configuração stdio local do Desktop. Em **Customize → Connectors → Add custom connector** (ou **Organization settings → Connectors** em Team/Enterprise), adicione uma URL HTTPS pública, por exemplo `https://api.example.com/mcp`.

Se houver **Request headers**, selecione **No sign-in** e configure `x-api-key: SUA_CHAVE`, `x-zappaz-preset: session` e `x-zappaz-session-id: ID_DA_SESSAO`. No sign-in desativa OAuth, não a autenticação exigida pelo Zappaz.

**Request headers está em beta e disponível somente para algumas organizações**, segundo a documentação oficial. Se a opção não aparecer, esse fluxo remoto não tem como fornecer a credencial exigida pelo Zappaz; use Claude Code com HTTP direto ou a ponte local do Desktop descrita abaixo. Não coloque o token na URL como alternativa.

Conectores remotos são acessados pela infraestrutura da Anthropic, inclusive no Claude Desktop/Cowork: `localhost`, VPN e endereços privados não são acessíveis apenas porque funcionam na sua máquina. Publique com HTTPS, configure `APP_URL` e ajuste o firewall. Clientes com Origin devem usar o domínio da instalação. Credenciais organizacionais podem ser compartilhadas: prefira uma chave restrita à sessão com o menor acesso necessário. A configuração stdio local do Desktop não é compartilhada com claude.ai/Cowork.

### Claude Desktop e clientes stdio

Se a versão do cliente não permitir um endpoint remoto com header `Authorization`, use uma ponte **local** como [`mcp-remote`](https://github.com/geelen/mcp-remote). Isso não adiciona outro servidor à API: é um processo auxiliar iniciado pelo cliente para converter stdio em Streamable HTTP.

No Claude Desktop, abra **Settings → Developer → Edit Config** e adicione a entrada em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zappaz": {
      "command": "bunx",
      "args": [
        "mcp-remote",
        "http://localhost:3001/mcp",
        "--transport",
        "http-only",
        "--protocol",
        "auto",
        "--header",
        "x-api-key:${ZAPPAZ_API_KEY}",
        "--header",
        "x-zappaz-preset:session",
        "--header",
        "x-zappaz-session-id:ID_DA_SESSAO"
      ],
      "env": {
        "ZAPPAZ_API_KEY": "SUA_CHAVE"
      }
    }
  }
}
```

O cliente precisa encontrar `bunx` no PATH. A ponte pode exigir Node.js. Reinicie o Claude Desktop após salvar. O arquivo com `env` preenchido contém um segredo: mantenha-o privado; também é possível fornecer `ZAPPAZ_API_KEY` pelo ambiente e omitir `env`.

Prefira a conexão HTTP direta quando o cliente oferecer suporte a headers personalizados. Não copie os campos `type: "remote"` e `servers` indiscriminadamente entre clientes: os schemas não são iguais.

### Windsurf

Em versões do Windsurf que usam `~/.codeium/windsurf/mcp_config.json`, adicione a entrada `mcpServers.zappaz` do exemplo de ponte stdio acima e recarregue os servidores MCP. A ponte envia o header exigido mesmo em versões sem configuração HTTP autenticada nativa.

Em versões mais recentes com outra interface de configuração, selecione uma conexão **Streamable HTTP**, informe a URL e o header do início deste guia, ou use a opção de comando stdio com a ponte. A localização e o formato da configuração variam por versão.

## Testar a conexão

Depois de conectar, peça ao agente: **“Use a ferramenta list_groups do Zappaz para listar meus grupos, sem enviar mensagens.”** Os grupos retornam sem participantes; para um grupo específico, peça `get_group_participants` com `groupId`. Essa consulta exige que o WhatsApp esteja conectado; para apenas verificar o catálogo MCP, use `tools/list` abaixo.

Para inspecionar as ferramentas:

```bash
curl 'http://localhost:3001/mcp' \
  -H 'x-api-key: SUA_CHAVE' \
  -H 'x-zappaz-preset: session' \
  -H 'x-zappaz-session-id: ID_DA_SESSAO' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

O SDK controla a negociação do protocolo, JSON-RPC e respostas HTTP/SSE. Não é o transporte SSE legado com endpoints `/sse` e `/messages`.

### Solução de problemas

| Sintoma | Verifique |
| --- | --- |
| `400` / preset ou sessão inválidos | Informe `x-zappaz-preset` e, no preset `session`, `x-zappaz-session-id` em todas as requisições. |
| `401` / acesso negado | Confira o ID, a chave e o header `x-api-key`. O escopo e as permissões atuais do proprietário devem autorizar a sessão. |
| `403` | Confira se `APP_URL` corresponde ao domínio HTTPS da instalação. Host e Origin do cliente devem usar esse domínio; clientes sem Origin ainda precisam de Host válido e autenticação. |
| `Session not enabled` / `Session not connected` | Habilite e conecte a sessão WhatsApp pela interface. O MCP pode listar ferramentas mesmo com WhatsApp offline. |
| Cliente tenta abrir login OAuth | Configure autenticação por header; no OpenCode use `oauth: false`. |
| Conexão recusada | Confira se a API está rodando e a porta está acessível. Em clientes na nuvem/containers, `localhost` aponta para o próprio cliente, não para sua máquina. |
| Resposta HTML ou `404` | Use a origem da API e o path `/mcp`, sem acrescentar `/sse` ou `/messages`. Confira o roteamento do proxy. |
| Ponte não inicia | Verifique `bunx` no PATH do aplicativo e os requisitos de runtime do `mcp-remote`. |

As instruções de Claude, Codex e OpenCode V2 foram revisadas nas fontes oficiais em **02/11/2026**. Os exemplos são modelos de configuração, não uma certificação de conexão real em todas as versões desses clientes. Referências: [OpenCode V2 MCP](https://opencode.ai/v2/docs/mcp-servers), [OpenCode V2 configuração](https://opencode.ai/v2/docs/config), [Codex MCP](https://developers.openai.com/codex/mcp/), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Claude e autenticação por request headers](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers), [requisitos de rede do Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) e [mcp-remote](https://github.com/geelen/mcp-remote).

## Ferramentas

O preset `session` expõe 34 ferramentas de WhatsApp e webhooks. O preset `user` adiciona sete ferramentas de gerenciamento de sessões, totalizando 41; consulte `tools/list` para os schemas de entrada.

| Área | Ferramentas MCP | `user` | `session` |
| --- | --- | :---: | :---: |
| Mensagens | `send_text_message`, `send_image_message`, `send_video_message`, `send_audio_message`, `send_document_message`, `send_contact_message`, `send_location_message`, `delete_message`, `edit_message` | Sim | Sim |
| Grupos | `list_groups`, `get_group_participants`, `create_group`, `update_group`, `add_participants`, `remove_participants`, `promote_participants`, `demote_participants`, `send_group_invite_link`, `update_group_picture` | Sim | Sim |
| Ações WhatsApp | `get_display_picture`, `update_display_picture`, `update_profile_status`, `update_profile_name`, `is_on_whatsapp`, `get_about`, `block_contact`, `unblock_contact` | Sim | Sim |
| Webhooks de sessão | `get_webhooks`, `create_webhook`, `update_webhook`, `delete_webhook` | Sim | Sim |
| Logs de webhooks | `get_webhook_logs`, `get_webhook_log`, `retry_webhook_log` | Sim | Sim |
| Gerenciamento de sessões | `list_sessions`, `create_session`, `get_session`, `update_session`, `delete_session`, `connect_session`, `logout_session` | Sim | Não |

Esses nomes são ferramentas MCP, não endpoints HTTP individuais: todas são chamadas pelo endpoint `/mcp`. A disponibilidade no catálogo não substitui as verificações de autenticação, acesso e estado da sessão.

### Editar mensagens

`edit_message` reutiliza o serviço da [API de edição](api.md#editar-mensagem-de-texto). No preset `session`, recebe `{"messageId":"ID_WHATSAPP_ORIGINAL","data":{"text":"Texto atualizado"}}`; a sessão vem do header autenticado e não aceita `sessionId` nos argumentos. No preset `user`, acrescente `sessionId` no nível superior; respeita propriedade e escopo da API Key.

Permite somente textos próprios e respostas de texto já persistidos, preservando a citação e o horário original. `data.text` tem 1–65.536 caracteres, não apenas espaços, e substitui o texto completo sem reaplicar assinatura. Exige sessão habilitada/conectada; não aceita mídias, legendas, templates interativos ou mensagens removidas. Retorna o `MessageDTO` atualizado serializado em `content[].text`, com `editedAt`, sem duplicar a mensagem, e notifica o chat via realtime. É uma operação de escrita (`readOnlyHint=false`, `destructiveHint=true`) com efeito no WhatsApp. Em falhas, retorna `isError=true`; consulte o histórico antes de tentar novamente, sem repetição automática.

### Ações WhatsApp por preset

As oito ações exigem sessão habilitada e WhatsApp conectado. No preset `session`, a sessão vem exclusivamente da autenticação/header e `sessionId` nos argumentos é rejeitado. No preset `user`, `sessionId` é obrigatório: usuários acessam somente suas sessões e administradores podem acessar qualquer sessão.

| Ferramenta | Argumentos no preset `session` | Resultado |
| --- | --- | --- |
| `get_display_picture` | `{ "identifier": "5511999999999" }` | Foto retornada pelo mesmo serviço da API HTTP |
| `update_display_picture` | `{ "data": { "identifier": "5511999999999", "source": "https://example.com/photo.jpg" } }` | Confirmação da alteração; `source` aceita URL ou base64 |
| `update_profile_status` | `{ "data": { "status": "Disponível" } }` | Confirmação da alteração do recado da sessão |
| `update_profile_name` | `{ "data": { "name": "Zappaz" } }` | Confirmação da alteração do nome da sessão |
| `is_on_whatsapp` | `{ "jid": "5511999999999" }` | `{ "isOnWhatsApp": true }` ou `false`, conforme o serviço |
| `get_about` | `{ "jid": "5511999999999" }` | Recado do contato retornado pelo serviço |
| `block_contact` | `{ "jid": "5511999999999" }` | Confirmação do bloqueio no WhatsApp |
| `unblock_contact` | `{ "jid": "5511999999999" }` | Confirmação do desbloqueio no WhatsApp |

No preset `user`, acrescente `sessionId` no nível superior desses argumentos. As consultas `get_display_picture`, `is_on_whatsapp` e `get_about` têm `readOnlyHint=true`; as demais são operações de escrita. `update_group_picture` permanece disponível com seu contrato atual. As ações alteram o WhatsApp, não a agenda local do Zappaz.

### Webhooks por preset

Os dois presets disponibilizam `get_webhooks`, `create_webhook`, `update_webhook` e `delete_webhook` para os webhooks da sessão. Eles funcionam com o WhatsApp desconectado e não gerenciam webhooks globais de administrador.

Também expõem as operações dos endpoints HTTP existentes de logs, reutilizando os mesmos serviços e o escopo de sessão/webhook:

| Ferramenta | Argumentos no preset `session` | Efeito |
| --- | --- | --- |
| `get_webhook_logs` | `webhookId`, `page` (1–10.000, padrão 1), `pageSize` (1–100, padrão 100), filtros opcionais `event`, `status`, `startDate`, `endDate` | Retorna `{ data, page, pageSize, total }`; paginação numérica na entrada, strings no resultado como na API HTTP. |
| `get_webhook_log` | `webhookId`, `logId` | Retorna o log com payload e resposta registrados. |
| `retry_webhook_log` | `webhookId`, `logId` | Reenvia o payload ao destino registrado e retorna o novo log. Pode duplicar efeitos no destinatário; o cliente deve solicitar aprovação antes de executá-lo. |

No preset `user`, acrescente `sessionId`. As consultas têm `readOnlyHint=true`; o reenvio tem `destructiveHint=true`. Essas anotações orientam o cliente MCP, mas não implementam uma confirmação adicional no servidor. Nenhuma dessas ferramentas exige WhatsApp conectado; o reenvio depende da sessão carregada no serviço. Elas não consultam nem reenviam logs de webhooks globais.

Os filtros de listagem seguem a API HTTP: `status` é uma string com o código HTTP, e as datas são strings ISO 8601, incluindo os dias inicial/final completos. Sem datas, a consulta abrange os últimos 30 dias até o fim do dia atual. Exemplo de diagnóstico no preset `user`, sem reenviar eventos:

```json
{ "name": "get_webhook_logs", "arguments": { "sessionId": "ID_DA_SESSAO", "webhookId": "ID_DO_WEBHOOK", "event": "presence.update", "page": 1, "pageSize": 100 } }
```

Após obter o `id` de um log, consulte seus detalhes no preset `session` (a sessão vem dos headers):

```json
{ "name": "get_webhook_log", "arguments": { "webhookId": "ID_DO_WEBHOOK", "logId": "ID_DO_LOG" } }
```

Somente depois de confirmar que é seguro repetir a entrega, solicite o reenvio:

```json
{ "name": "retry_webhook_log", "arguments": { "webhookId": "ID_DO_WEBHOOK", "logId": "ID_DO_LOG" } }
```

Os exemplos representam os parâmetros de `tools/call`. O resultado é serializado como JSON em `content[].text`; falhas de acesso, validação ou recurso indisponível são devolvidas como erro MCP, sem detalhes internos.

Um log comprova uma tentativa de entrega ao webhook, não a exibição de `chat.typing` no chat. A ausência de logs não comprova ausência de presença na Baileys: o webhook e o evento `presence.update` precisam estar habilitados, e a retenção pode ter removido logs antigos.

| Preset | Seleção da sessão | Credenciais |
| --- | --- | --- |
| `user` | Informe `sessionId` nos argumentos de cada ferramenta. O usuário comum acessa apenas as próprias sessões; administradores podem acessar qualquer sessão. | `x-api-key` ou cookie de usuário autorizado. |
| `session` | Informe `x-zappaz-session-id` em todas as requisições; não inclua `sessionId` nos argumentos. | Chave restrita à sessão, chave global autorizada ou cookie autorizado. |

Por exemplo, para listar webhooks no preset `user`:

```json
{ "name": "get_webhooks", "arguments": { "sessionId": "ID_DA_SESSAO", "page": 1, "pageSize": 100 } }
```

No preset `session`, a chamada equivalente usa `{ "page": 1, "pageSize": 100 }`, pois a sessão já está no header. Para criar um webhook, envie `data` com `url`, `events` e, opcionalmente, `displayName`, `enabled` e `headers`. Para atualizar ou excluir, informe `webhookId`; inclua `sessionId` também no preset `user`. Por padrão, um webhook criado sem `enabled` fica desativado.

Os envios e criações/edições recebem `{ "data": { ... } }`. No preset `user`, inclua também `sessionId` nos argumentos das operações vinculadas a uma sessão. Operações em grupo usam `groupId`, exclusão de mensagem usa `messageId`, e atualização/exclusão de webhook usa `webhookId`. Participantes usam `{ "groupId": "grupo@g.us", "data": ["5511999999999"] }`. `update_group_picture` recebe `{ "data": { "identifier": "grupo@g.us", "source": "https://example.com/image.jpg" } }`. `get_webhooks` aceita `page` e `pageSize` numéricos (padrão 1/100, máximo 100 por página).

Nas ferramentas `send_image_message`, `send_video_message`, `send_audio_message`, `send_document_message` e `update_group_picture`, `data.source` aceita uma **URL da mídia** ou o **conteúdo do arquivo codificado em base64**. A mídia precisa ser válida e seu tipo precisa ser reconhecido. Por exemplo, os argumentos de `send_image_message` podem ser:

```json
{ "data": { "number": "5511999999999", "source": "https://example.com/imagem.jpg", "caption": "Olá!" } }
```

Ou, com base64 (substitua o valor pelo conteúdo completo do arquivo):

```json
{ "data": { "number": "5511999999999", "source": "BASE64_DO_ARQUIVO", "fileName": "imagem.jpg" } }
```

Vídeos também aceitam `gifPlayback`, e áudios aceitam `asVoiceNote`. Os campos opcionais e seus padrões estão disponíveis no schema de cada ferramenta em `tools/list`.

`list_groups` omite o campo `participants` para reduzir o payload. Para consultar os participantes de um grupo específico, chame `get_group_participants` com `{ "groupId": "grupo@g.us" }`.

Exemplo de `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "send_text_message",
    "arguments": { "data": { "number": "5511999999999", "message": "Olá!" } }
  }
}
```

As ferramentas chamam os serviços existentes diretamente. Mensagens/grupos exigem sessão habilitada e conectada; gerenciamento de webhooks funciona mesmo com WhatsApp desconectado. Listagem de ferramentas e negociação não exigem conexão WhatsApp. Resultados são JSON serializado em conteúdo textual MCP. Falhas de domínio são resultados `isError: true`; erros inesperados têm mensagem genérica. Falhas de autenticação ocorrem antes do handler e retornam o contrato HTTP de erro da API.

Enviar, apagar, gerenciar sessões e membros e alterar webhooks tem efeito real; configure aprovações no cliente MCP. A anotação de ferramenta não substitui autorização ou confirmação.

## Proteções e deploy

- Validação oficial de Host e Origin e rate limit antes da execução. Os hosts são derivados de `APP_URL` em produção; o desenvolvimento inclui hosts locais. Veja [ambiente](environment.md).
- Requests sem Origin (clientes não-browser) são aceitos; isso não dispensa token ou validação de Host.
- `/mcp` e seus subpaths são reservados e não recebem o HTML da SPA.
- O mesmo build/imagem Docker inclui o módulo. No Dokploy, faça redeploy do Compose de produção; nenhuma migration ou seed específica do MCP é necessária.
- Execute `bun run test` para os testes isolados, sem WhatsApp, banco ou rede reais.
