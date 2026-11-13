# AGENTS.md — `test/`

Testes automatizados com `bun:test`, organizados por área em subpastas. Rode sempre da raiz: `bun run test` (ou `bun test ./test`).

## Como trabalhar

- Cada área tem sua pasta (`frontend/`, `seed/`, `whatsapp/`). Crie subpasta nova em vez de soltar arquivos soltos aqui.
- Importe o código testado por caminho relativo terminando em `.ts` (ex.: `../../server/src/...`).
- Testes devem ser isolados: por padrão, sem banco, sem rede e sem iniciar o servidor. Use fixtures em diretório temporário (`/tmp/opencode/...`) e limpe no `afterAll`. A integração Better Auth usa PostgreSQL em container Docker descartável, sem acessar ou resetar o banco de desenvolvimento.
- Não dependa de `.env` real nem de dados de produção; monte entradas explícitas. Quando precisar de env, passe só o mínimo via `Bun.spawn`.
- Nomeie arquivos como `*.test.ts` e descreva o comportamento no `describe`/`test`. Arquivos auxiliares (fixtures) não levam `.test.ts`.
- Ao mudar um contrato (rotas, schema, normalizador), atualize o teste correspondente na mesma alteração.
- Ao ajustar testes após mudanças do usuário, preserve o código atual e atualize as expectativas dos testes; não reverta a implementação para restaurar o comportamento antigo esperado pelo teste.

## Áreas

### `frontend/` — roteamento do build

- `routes.test.ts` monta o app com `createApp()` + `createFrontendRouter(rootPath)` e uma fixture de `dist/` em diretório temporário.
- Use `app.request()` do Hono; não suba `Bun.serve` nem use porta real.
- Cubra `/` com HTML e `no-cache`, assets com content-type correto, fallback SPA para navegação e 404 JSON para `/api`, `/admin`, `/health`, `/assets/*`, arquivos com extensão e path traversal.

### `seed/` — configuração do seed

- `config.test.ts` valida apenas o schema puro (`AdminSeedSchema`), sem executar `db:seed` e sem tocar no banco.
- Cubra credenciais válidas, e-mail inválido/ausente, senha ausente e variáveis não relacionadas.
- Fique restrito a `ADMIN_EMAIL`/`ADMIN_PASSWORD`; não exija `CLIENT_SECRET`/`DATABASE_URL`.

### `whatsapp/` — eventos e webhooks

- Testes de normalização chamam as funções puras de `server/src/lib/whatsapp-event-normalizer.ts` (texto, mídia, reações, recibos, status, timestamps) e não tocam banco/rede.
- `webhook-fixture.ts` é um processo isolado usado por `webhook-integration.test.ts`: faz `mock.module` de `@db/prisma`/`axios` e guarda dados em memória; não o transforme em teste nem o importe diretamente.
- A integração roda `bun --no-env-file --tsconfig-override server/tsconfig.json` via `Bun.spawn`, com cwd `/tmp/opencode` e env mínimo (`CLIENT_SECRET`, `DATABASE_URL`, `NODE_ENV`). Preserve esse isolamento.
- Ao alterar o normalizador ou o publisher de webhooks, atualize fixture e asserções juntos.

### `account/` — Better Auth

- `better-auth-postgres.test.ts` aplica as migrations em um container PostgreSQL isolado e o remove ao terminar; requer Docker e a imagem `postgres:17-alpine`.
- Serviços frontend ficam em `src/services/`; o cliente Better Auth fica em `src/lib/auth-client.ts`.
