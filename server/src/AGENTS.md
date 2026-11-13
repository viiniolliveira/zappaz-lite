# AGENTS.md — `server/src/`

Código da API Hono/Bun. Leia também `server/AGENTS.md` (comandos e variáveis) e `docs/backend.md`.

## Como trabalhar

- Entrypoint: `app.ts` (middlewares, composição de rotas, `startServer`). Tipagem do contexto Hono e `createRouter()` ficam em `create-app.ts`.
- Todo router novo nasce de `createRouter()` e é registrado em `app.ts`; `modules/frontend/route.ts` é sempre o último.
- Use os aliases do `server/tsconfig.json`: `@server/*`, `@db/*`, `@lib/*`, `@services/*`, `@middleware/*`, `@generated/*`.
- Imports internos em TypeScript usam extensão `.ts` (Biome `useImportExtensions`) e arquivos em `kebab-case`.
- Erros esperados: lance subclasses de `AppError` (`common/errors/`); o `errorHandler` converte Zod, Prisma e HTTPException em JSON padronizado.
- Mantenha uma única infraestrutura central de logging em `lib/logger.ts`, com configuração, sanitização e saída compartilhadas. Integre HTTP e bibliotecas por esse logger ou seus children; não crie loggers independentes nem use `console.log` em código de runtime.
- Não crie `package.json`/lockfile; comandos rodam na raiz (`bun run dev:backend`, `bun run check:backend`).

## Camadas

`common/` erros e handlers · `config.ts` env · `create-app.ts` contexto · `db/` Prisma e seed · `lib/` infraestrutura · `middleware/` auth/CORS/rate limit · `modules/` domínio HTTP · `services/` WhatsApp.
