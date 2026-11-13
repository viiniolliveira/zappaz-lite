# AGENTS.md — `docker/`

Containerização da aplicação completa.

## Como trabalhar

- `Dockerfile` é multi-stage (`oven/bun:1.4.4`), instala com `bun install --frozen-lockfile`, gera o Prisma Client, roda `bun run build` e inicia com `bun run start`.
- O contexto de build é a **raiz** do repositório (`bun run docker:build`); não mova o Dockerfile para a raiz nem crie um contexto em `server/`.
- Só copie para a imagem o necessário (`package.json`, `bun.lock`, `node_modules`, `server/`, `shared/`, `dist/`). Nunca copie `.env`.
- Mantenha Composes independentes: `docker-compose.dev.yml` para PostgreSQL e Drizzle Gateway locais; `docker-compose.prod.yml` para aplicação e PostgreSQL no Dokploy. Nunca inclua Drizzle Gateway na produção.
- Na produção, aguarde o healthcheck do banco, rode `db:migrate:deploy` e então inicie. Não adicione seed automático.
- Mantenha o healthcheck em `/health` e os volumes de banco e mídia; os comandos `*:down` não devem apagar dados. Use projetos Compose distintos para desenvolvimento e produção.
- Passe configurações e segredos somente em runtime. Não use argumentos ou variáveis `VITE_*`; frontend e API compartilham a origem.
- Use o `.env` da raiz da aplicação também para o Drizzle Gateway, incluindo `MASTERPASS`; não exija um arquivo de ambiente separado.
- Valide os dois Composes e o build da imagem. Teste produção em projeto/volumes isolados, sem parar serviços locais ou tocar nos seus dados.
