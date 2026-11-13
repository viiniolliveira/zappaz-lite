# Zappaz Lite API

Backend Hono/TypeScript com Baileys e PostgreSQL/Prisma 7. Todo código da API está nesta pasta, mas dependências e comandos são compartilhados com o frontend no pacote da raiz.

Execute **na raiz do repositório**:

```bash
bun install
bun run db:generate
bun run db:migrate:dev
bun run dev:backend
```

Configure o `.env` na raiz a partir de `.env.example`. A API e o Prisma usam `DATABASE_URL`; a API exige `CLIENT_SECRET` e, em produção, `APP_URL` HTTPS. No Dokploy, a conexão é montada pelo Compose com `POSTGRES_PASSWORD`.

- Entrada e composição de rotas: `src/app.ts`.
- Módulos de domínio: `src/modules/*`.
- Prisma config: `prisma.config.ts`; schema/migrations: `prisma/`.
- Client gerado: `generated/prisma`, importado por `@generated/prisma`.
- Typecheck: `bun run build:backend` (não emite arquivos).
- Biome read-only + typecheck: `bun run check:backend`.
- Produção: `bun run build` e `bun run start`; serve API e frontend de `dist/` na porta 3001.
- Arquivos estáticos e fallback SPA: `src/modules/frontend/route.ts`, usando o `serveStatic` oficial do Hono e sem interceptar os 404 da API.
- **Destrutivo:** `bun run db:seed` remove usuários e sessões WhatsApp antes de recriar os dados.
- Instalação: o startup cria o primeiro administrador com `ADMIN_EMAIL`/`ADMIN_PASSWORD` quando não há usuários. Recuperação usa `ADMIN_RESET_PASSWORD=true` e redeploy; desative a flag depois. `bun run db:create-admin` continua disponível para criar contas adicionais.

Mantenha CLI, client e adapter Prisma em 7.8.0, sem atualizar para versão 8. Não crie manifests ou lockfiles nesta pasta.

Veja [README principal](../README.md), [documentação do backend](../docs/backend.md) e [referência da API](../docs/api.md). A API disponibiliza o Scalar em `/docs` e o contrato OpenAPI gerado em `/openapi.json`, ambos autenticados. O projeto é distribuído sob a [licença MIT](../LICENSE).
