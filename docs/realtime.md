# Realtime da interface autenticada

Cada aba mantém um único Socket.IO em `/api/ws`, criado pelo `realtimeAppEffectAtom` no layout autenticado e encerrado ao sair dele. Navegar, fechar modais ou sair do chat não encerra a conexão global nem a sessão WhatsApp. A interface usa cookie Better Auth. Integrações usam `auth: { apiKey: 'SUA_CHAVE' }` ou header `x-api-key`. O escopo global/sessão é preservado em inscrições e entregas; `auth.token` e JWTs não são aceitos. Nunca envie credenciais na URL. Cada revalidação consome o limite da chave; revogação/expiração bloqueia novas entregas e inscrições.

## Limites de entrada

O orçamento é compartilhado por usuário, incluindo cookies e chaves diferentes do mesmo proprietário: até cinco conexões simultâneas e 30 tentativas de operações em cada janela de 10 segundos, sem renovar o orçamento ao reconectar. Handshakes autenticados também consomem esse orçamento. Há até quatro operações solicitadas pelo cliente em voo por usuário; inscrições de chat/logs, presença e reconhecimento de erros de sync passam pelo controle antes de consultar o banco. Unsubscribe consome tentativas, mas não ocupa um slot de consulta, permitindo cancelar uma inscrição pendente mesmo sob concorrência máxima.

Antes da autenticação, handshakes também têm orçamento por IP, usando o mesmo resolvedor de HTTP. Por padrão, somente o endereço do transporte é considerado. `x-real-ip` é aceito somente quando `TRUST_PROXY=true` e contém um IP válido; `Forwarded` e `X-Forwarded-For` não são fontes de identidade. O operador deve garantir que o proxy sobrescreve o header e que clientes não confiáveis não alcançam diretamente o backend antes de habilitar essa opção. Conexões recusadas não recebem acesso a eventos. O estado de orçamento é limitado a 10 mil identidades por processo; identidades sem conexões ou operações pendentes expiram após 60 segundos ociosas, com limpeza sob demanda. Os controles são locais ao processo, não quotas distribuídas entre réplicas.

IDs arbitrários recebidos em unsubscribe não criam estado persistente no socket. Tokens de inscrição são mantidos somente enquanto a operação está pendente e são invalidados ao cancelar ou desconectar. A revalidação periódica de 15 segundos permanece ativa, sem sobrepor execuções no mesmo socket. Excesso é recusado no handshake ou pelo acknowledgement do evento, sem executar a consulta correspondente.

O endereço é resolvido antes do upgrade WebSocket, no callback de admissão do Bun Engine, usando `server.requestIP(request)` e a política opt-in de proxy acima, e associado à conexão por WeakMap. Não se usa `socket.handshake.address`, pois o adaptador instalado não o preenche; após o upgrade, a consulta nativa também pode não estar mais disponível. Sem IP resolvido, a conexão é rejeitada em vez de compartilhar um orçamento global de endereço ausente.

Notificações de chat, logs e invalidações globais, assim como a revalidação periódica, compartilham os quatro slots de trabalho por usuário sem consumir as 30 tentativas reservadas à entrada do cliente. Não há fila ilimitada de notificações: sob saturação, notificações podem ser descartadas, mas a conexão recebe um sinal `app.resync` com `{ version: 1 }`, coalescido no máximo uma vez por segundo. O sinal não carrega IDs ou dados privados; sua pendência é removida ao desconectar. Ele solicita reconciliação HTTP, não replay das mensagens descartadas.

Capacidade ou orçamento temporariamente esgotados no handshake retornam `RATE_LIMITED`, com `retryAfterMs: 10000`, não `UNAUTHORIZED`. Autenticação inválida permanece um erro de autorização: indisponibilidade temporária não deve bloquear permanentemente a reconexão nem apagar rascunhos.

A conexão compartilhada da interface tenta novamente após `RATE_LIMITED`, com um único timer e backoff de 10, 20 e até 30 segundos. Sucesso, falha real de autenticação ou saída da área autenticada cancelam o timer. `app.resync` é validado por versão e recompõe consultas HTTP sem exigir reconexão; sinais durante uma consulta em andamento são coalescidos em uma atualização posterior, sem reiniciar continuamente a mesma consulta. A tabela de logs preserva a paginação e refaz automaticamente somente a primeira página ativa.

## Invalidações globais

O backend publica `app.invalidate` depois de confirmar alterações feitas pelos serviços, inclusive por API externa, eventos Baileys e tarefas internas. Não há monitoramento de SQL executado diretamente no banco. O QR Code é um estado temporário e publica depois de ser gerado.

```json
{
  "version": 1,
  "eventId": "00000000-0000-4000-8000-000000000001",
  "resource": "sessions",
  "sessionId": "ID_DA_SESSAO",
  "webhookId": null,
  "deleted": false
}
```

| Recurso | Produtores | Consumidores |
| --- | --- | --- |
| `sessions` | Criação, edição, arquivo/desarquivo, exclusão, status persistido e renovação do QR | Lista, detalhe e modal |
| `webhooks` | CRUD de webhook de sessão | Lista/configuração de webhooks da sessão |
| `usage` | Registro persistido de envio | Histórico e gráficos de uso da sessão |
| `logs` | Registro persistido de entrega de webhook | Tabela paginada do webhook (`webhookId` preenchido) |
| `conversation-labels` | Criação, edição e exclusão de etiquetas locais | Catálogo de etiquetas, listas e detalhes de conversas da sessão |

As query keys pertencem ao frontend. O servidor envia recursos tipados, não comandos arbitrários de cache. Cada entrega revalida o usuário e o escopo: somente proprietário/admin autorizado recebe eventos; chaves restritas recebem apenas os da sessão selecionada, nunca eventos globais ou de outras sessões.

Mutations preservam a atualização local. Enquanto conectado, o cliente HTTP envia `X-Realtime-Socket-Id` em escritas; o backend associa a origem ao usuário autenticado e exclui somente aquela conexão das invalidações redundantes. A origem não autoriza acesso. Outras abas recebem os eventos. Atualizações independentes do WhatsApp e notificações de logs são distribuídas a todos os usuários autorizados.

Sessões/webhooks/etiquetas são agrupados em 100 ms. Uso/logs são agrupados em janelas de 1 segundo. Na tabela de logs, as páginas ficam stale, mas somente a primeira página ativa refaz a consulta automaticamente. Páginas seguintes preservam as linhas e mostram “Novos logs disponíveis”; a ação volta à primeira página. Uma consulta em andamento não é reiniciada a cada evento.

Ao reconectar, o app revalida os dados consultáveis; páginas seguintes de logs continuam preservadas e oferecem atualização. Eventos não têm replay durável, portanto as consultas HTTP são a fonte de reconciliação.

## Chat

Inscrições, cache, reconexão e sincronização específicos do chat estão em [Realtime do chat](chat/realtime.md). Eventos de cada domínio ficam nos guias de [contatos](chat/contacts.md#realtime), [conversas](chat/conversations.md#realtime) e [etiquetas](chat/labels.md#realtime-e-isolamento).

## Logs ao vivo

O SSE de logs foi substituído. Use `logs.subscribe` e `logs.unsubscribe` com `{ sessionId, webhookId }` e callback de confirmação. O backend valida a sessão e o vínculo do webhook, revalida acesso antes de entregar cada log e limpa listeners ao cancelar a inscrição ou desconectar. `logs.revoked` informa a perda de acesso ao recurso.

`logs.entry` carrega `{ version: 1, type: "webhook-log.created", data: WebhookLog }`. O drawer recebe registros diretamente, deduplica por ID e mantém até 500 itens. Após confirmar a inscrição, busca até 100 registros persistidos mais recentes no período padrão de 30 dias e combina com eventos recebidos durante a consulta. Ao abrir, seleciona o log mais recente disponível e exibe seus detalhes. O snapshot também é buscado na reconexão; não representa replay ilimitado. O histórico completo continua acessível pela tabela paginada HTTP.

Com o drawer aberto, `app.resync` também solicita o snapshot limitado de 100 registros, preservando deduplicação, isolamento da sessão/webhook e limite de 500 itens. Respostas antigas são ignoradas após mudança de inscrição ou fechamento; sinais repetidos não criam consultas simultâneas ilimitadas. A chegada de um snapshot não substitui uma seleção feita pelo usuário ou por um evento ao vivo durante a consulta.

O modal de conexão usa consulta inicial e invalidações globais, sem polling. O detalhe de sessão retorna `qrCodeBase64` atual ou `null`; fechar o modal não chama logout.
# Revogação de integrações

A autorização verifica a chave, o escopo, as permissões e o bloqueio do proprietário. Revogação, expiração e alteração/reset de senha bloqueiam a conexão na próxima revalidação (15 segundos); HTTP/MCP rejeitam a próxima requisição.

Regressão com autenticação e PostgreSQL reais: `bun --no-env-file test ./test/security/authorization-postgres.test.ts`. A integração usa Docker descartável e WebSocket em loopback, verifica inscrições/entregas após perda de acesso e não conecta ao WhatsApp. Ela não exercita a espera do timer de 15 segundos nem substitui a validação do proxy de produção.
