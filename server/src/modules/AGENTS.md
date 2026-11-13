# AGENTS.md — `server/src/modules/`

Módulos HTTP por domínio. O padrão é sempre o mesmo:

```text
<modulo>/
├── route.ts      # rotas + middlewares, sem lógica
├── controller.ts # parse do request, chama service, monta resposta
├── service.ts    # regra de negócio e Prisma
├── schema.ts     # schemas Zod 4 do request/query
└── types.ts      # z.infer + tipos do Prisma
```

## Como trabalhar

- `route.ts` só declara paths e middlewares (`createRouter()`, `require*`, `rateLimiter`). Controllers não fazem query Prisma; services não conhecem `Context`.
- Controllers: `Schema.parse(await c.req.json())` / `parse(c.req.param()/query())`, chamam o service e retornam `c.json(..., status)`. Deixe erros subirem para o `errorHandler`.
- Schemas importam de `zod` (nunca `zod/v3`) e usam `z.record(chave, valor)` explícito.
- Services importam `prisma` de `@db/prisma`, dependências de `@lib/*` e `@services/*`; nunca importam Hono/`Context`.
- Ao retornar uma listagem paginada com contagem total, consulte `count` e os itens juntos usando `prisma.$transaction`.
- Registre o router em `server/src/app.ts`, respeitando os prefixos (`/admin`, `/api/v1`, `/`). Não crie rotas fora do módulo.
- Rotas de sessão seguem a ordem: `rateLimiter` → `requireSession` → `requireSessionAuth` → estado (`requireEnabledSession`/`requireConnectedSession`).
- Nomes de arquivos em `kebab-case`; imports com extensão `.ts`.
- Implemente o MCP integrado em `mcp/` com o SDK oficial v2 (`@modelcontextprotocol/server` e `@modelcontextprotocol/hono`), usando Streamable HTTP no mesmo processo Hono.
- Omita `participants` no resultado da ferramenta MCP `list_groups`; exponha os participantes por `get_group_participants`, recebendo `groupId`.
- No envio de áudio do chat (`conversation-messages`), use `ptt: false`, inclusive para gravações com `voice=true`; não envie esses áudios com `ptt: true`.
- Verificação: `bun run check:backend` na raiz.

## Módulos

`auth` handler nativo Better Auth · `sessions` ciclo de vida · `webhooks` webhooks por sessão e consulta de logs · `global-webhooks` webhooks globais · `whatsapp-messages` envio/mídia · `whatsapp-groups` grupos · `whatsapp-actions` perfil/contatos · `whatsapp-privacy` privacidade · `send-message-history` histórico agregado · `frontend` assets do build. Login, perfil, senha e CRUD de usuários usam endpoints oficiais Better Auth, incluindo o plugin admin. Logs ao vivo usam o Socket.IO compartilhado em `server/src/realtime/`.
