# AGENTS.md — `server/src/db/`

Acesso a dados, utilidades de autenticação por token e seed.

## Como trabalhar

- Use sempre o singleton `prisma` de `db/prisma.ts` (Prisma 7 + `@prisma/adapter-pg`); não instancie `new PrismaClient()` em módulos.
- Tipos do client vêm de `@generated/prisma`; nunca importe de `@prisma/client`.
- `utils.ts` usa o hash nativo Better Auth e revoga API Keys em alteração/reset de senha. Login humano usa `lib/auth.ts`, Account e AuthSession; integrações usam API Keys globais/restritas, nunca JWTs.
- `seed.ts` é destrutivo: apaga usuários e sessões WhatsApp antes de recriar. Lê `ADMIN_EMAIL`/`ADMIN_PASSWORD` via `seed-config.ts`; valide antes de deletar e nunca logue a senha.
- Rode comandos na raiz: `bun run db:generate`, `db:migrate:dev`, `db:seed`. `DATABASE_URL` é lido pelo runtime e pelo `server/prisma.config.ts`.
- No startup, crie o administrador de `ADMIN_EMAIL`/`ADMIN_PASSWORD` somente se não houver usuários. Redefina sua senha e revogue seus logins apenas com `ADMIN_RESET_PASSWORD=true`; preserve dados e sessões WhatsApp. O comando manual `db:create-admin` continua rejeitando email existente. Não use seed destrutivo no deploy.
- Não adicione lógica de negócio de módulo aqui; apenas persistência, credenciais e utilidades de token.
