# AGENTS.md — `server/prisma/`

Fonte da verdade do banco: schema, migrations e ERD. A configuração do CLI fica em `server/prisma.config.ts` (raiz de execução: repositório).

## Como trabalhar

- Edite `schema.prisma` e gere migration com `bun run db:migrate:dev -- --name <descricao>`; nunca edite uma migration já aplicada.
- Depois de mudar o schema, rode `bun run db:generate` (client em `server/generated/prisma`, importado por `@generated/prisma`).
- Datasource PostgreSQL; runtime e CLI/seed usam somente `DATABASE_URL`, lida via `env()` no config do Prisma.
- `erd.md` documenta o modelo; atualize quando entidades/relações mudarem.
- O seed real está em `server/src/db/seed.ts` (destrutivo) e é referenciado por `prisma.config.ts`.
- Mantenha Prisma CLI, client e adapter em `7.8.0`; não atualize para v8.

## `migrations/`

- Pasta gerada pelo Prisma CLI; trate o histórico como imutável: não edite, renomeie nem apague migrations aplicadas.
- Revise o SQL apenas para confirmar que reflete `schema.prisma`; não inclua mudanças manuais sem necessidade.
- Em produção/Compose, aplique com `bun run db:migrate:deploy` (nunca `migrate dev`).
- Não versione bancos locais nem artefatos de seed aqui.
