# Zappaz Lite

Aplicação full-stack para gerenciamento de sessões WhatsApp, envio de mensagens, webhooks e logs em tempo real.

O Zappaz Lite usa a biblioteca comunitária [Baileys](https://github.com/WhiskeySockets/Baileys) e não é afiliado, autorizado ou endossado pelo WhatsApp ou pela Meta. A integração não usa a API oficial do WhatsApp e pode sofrer mudanças ou interrupções. Avalie os termos aplicáveis, a privacidade dos dados e o risco de restrição da conta antes de usar o serviço.

O frontend Vite/React fica na raiz e a API Hono em `server/`. Ambos compartilham um único `package.json`, `bun.lock` e instalação de dependências com Bun. Em desenvolvimento o Vite roda separado; após o build, o Hono serve a interface e a API no mesmo processo.

## Funcionalidades

- Integração com WhatsApp via Baileys e gerenciamento de sessões.
- Mensagens de texto, imagem, vídeo, áudio, documento, contato e localização.
- Webhooks configuráveis e logs ao vivo pelo Socket.IO compartilhado da interface.
- Autenticação Better Auth com cookie HttpOnly e API Keys globais/restritas à sessão.
- Persistência PostgreSQL com Prisma 7.
- PWA instalável no celular/desktop, com aviso de atualização e tela de conexão indisponível ([detalhes](./docs/frontend.md#pwa-e-instalação)).
- MCP integrado via SDK oficial v2 e Streamable HTTP em `/mcp` ([configuração](./docs/mcp.md)).
- SDK TypeScript para bots e integrações: [@zappaz/zappaz-lite-sdk](https://www.npmjs.com/package/@zappaz/zappaz-lite-sdk) ([guia de uso](./docs/sdk.md)).

## Estrutura

```text
zappaz-lite/
├── src/                  # Frontend React 19 + React Router 7
├── public/
├── index.html
├── vite.config.ts
├── tsconfig.app.json     # TypeScript do navegador
├── tsconfig.node.json    # TypeScript da configuração Vite
├── server/
│   ├── src/              # API Hono + WhatsApp/Baileys
│   ├── prisma/           # Schema e migrations PostgreSQL
│   ├── prisma.config.ts
│   ├── tsconfig.json     # TypeScript e aliases do backend
│   └── generated/prisma/ # Gerado, não versionado
├── docker/
├── docs/
├── .env.example
├── package.json
└── bun.lock
```

## Setup local

Pré-requisitos: Bun 1.4.3 e PostgreSQL (ou Docker Compose para o banco local). Execute todos os comandos na raiz:

```bash
cp .env.example .env
bun install
```

Edite `.env` antes de continuar: gere valores diferentes para `CLIENT_SECRET` e `MASTERPASS` (por exemplo, com `openssl rand -hex 32`) e defina `ADMIN_EMAIL` e uma senha forte em `ADMIN_PASSWORD`. Confirme `DATABASE_URL`; o exemplo usa o banco local do Compose. Nunca use os valores de exemplo em produção.

Para produção, use os exemplos em [`docker/.env.compose.example`](docker/.env.compose.example) (Compose/Dokploy) ou [`docker/.env.dockerfile.example`](docker/.env.dockerfile.example) (Dockerfile com banco externo). Veja [ambiente](docs/environment.md) e [deploy](docs/deployment.md).

```bash
bun run db:up
bun run db:generate
bun run db:migrate:dev
bun run dev
```

O banco local usa `postgres:postgres@localhost:5432/postgres`. Após iniciar, acesse `http://localhost:5173` e entre com as credenciais de administrador configuradas no `.env`.

No primeiro deploy, configure `ADMIN_EMAIL` e `ADMIN_PASSWORD`: o startup cria o administrador automaticamente quando não há usuários, usando Better Auth. Depois, altere a senha pela interface; reinícios normais preservam essa alteração. Para recuperar acesso, configure uma nova senha, ative `ADMIN_RESET_PASSWORD=true` e faça redeploy; depois remova a flag. Consulte [deploy](docs/deployment.md). **Não use `db:seed` na instalação: ele remove usuários e sessões WhatsApp.**

O Vite abre em `http://localhost:5173`; a API em `http://localhost:3001` (`GET /health`). O frontend usa a mesma origem, com proxy local para HTTP/SSE/WebSocket. **Não há variáveis de ambiente de frontend nem segredos no build.**

## Comandos

```bash
bun run dev                 # Frontend e API em paralelo
bun run dev:frontend        # Apenas Vite
bun run dev:backend         # Apenas API com watch
bun run build               # Typecheck dos dois + build Vite em dist/
bun run build:frontend      # Typecheck frontend + build Vite
bun run build:backend       # Apenas typecheck da API (sem emissão)
bun run preview             # Preview do build estático
bun run test                # Testes em test/, organizados por área
bun run start               # API + frontend de dist/ em produção com Bun
bun run lint:frontend       # Biome do frontend
bun run check:backend       # Biome read-only + typecheck da API
bun run check               # Formata arquivos com Biome e verifica os tipos
bun run db:up               # Sobe PostgreSQL e Drizzle Gateway locais
bun run db:down             # Para os serviços locais sem apagar volumes
bun run db:logs             # Logs do banco
bun run db:generate         # Gera server/generated/prisma
bun run db:migrate:dev      # Migrations de desenvolvimento
bun run db:migrate:deploy   # Migrations de produção
bun run db:migrate:reset    # Destrutivo: reseta banco com confirmação
bun run db:seed             # Destrutivo: remove usuários e sessões antes do seed
bun run db:create-admin     # Cria administrador sem apagar dados
bun run docker:build        # Imagem da API usando contexto da raiz
bun run docker:dev:up       # PostgreSQL + Drizzle Gateway (dev)
bun run docker:dev:down     # Para dev sem apagar volumes
bun run docker:dev:logs     # Logs de dev
bun run docker:prod:up      # Build + app + PostgreSQL + migrations (rede Dokploy)
bun run docker:prod:down    # Para prod sem apagar volumes
bun run docker:prod:logs    # Logs de prod
bun run docker:run          # API em container com .env da raiz
```

Prisma CLI, client e adapter PostgreSQL estão fixados em **7.8.0**. Não atualizar para Prisma 8. Frontend e backend usam a mesma dependência Zod 4, atualizada para a versão mais recente (4.6.7 nesta migração), sem a camada de compatibilidade v3.

## Autenticação e logs

O frontend usa Axios com `withCredentials: true` e espera cookie HttpOnly. Configure CORS com origem explícita e credentials, além dos atributos `Secure`, `SameSite`, `Path` e `Domain` conforme o deploy. O logout deve expirar o mesmo cookie.

O guard valida a sessão por `GET /api/v1/session`. A área autenticada mantém uma conexão Socket.IO em `/api/ws`, compartilhada por invalidações de sessões/webhooks/uso, chat e logs ao vivo. Modais não encerram a conexão e o modal de conexão não usa polling. Veja [Realtime](docs/realtime.md).

## Conectar ao MCP

O MCP já roda junto com a API, sem instalar ou iniciar o servidor Python separado:

```text
URL: http://localhost:3001/mcp
Header: x-api-key: SUA_CHAVE
Header: x-zappaz-preset: session
Header: x-zappaz-session-id: ID_DA_SESSAO
Transporte: Streamable HTTP
```

Crie uma chave na página Chaves de API, selecionando acesso global ou uma sessão. O preset `user` exige chave global e recebe o ID em cada ferramenta; o preset `session` aceita uma chave autorizada para a sessão indicada no header. Mensagens e grupos exigem WhatsApp habilitado e conectado.

Veja o **[guia de conexão MCP](./docs/mcp.md#configuração-por-cliente)** com exemplos para OpenCode, Cursor, Antigravity, VS Code, Claude Code, Claude Desktop e Windsurf, além de teste com cURL e solução de problemas. Em produção, use a URL HTTPS da instalação configurada em `APP_URL`; as proteções de Host e Origin são derivadas dela.

## Deploy

A aplicação completa roda em uma única origem. No Dokploy, selecione `docker/docker-compose.prod.yml` e configure, no primeiro deploy:

```env
APP_URL=https://zappaz.example.com
CLIENT_SECRET=change-me
POSTGRES_PASSWORD=change-me
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-to-a-strong-password
```

Gere dois segredos diferentes com `openssl rand -hex 32` e escolha uma senha forte para o administrador. Remova as credenciais do administrador do ambiente após a criação da conta. Em **Domains**, aponte o domínio para **app:3001**, com HTTPS. O Dokploy gerencia o proxy; o Compose mantém banco e mídias em volumes, aplica migrations e não executa seed. Não há portas públicas do banco nem Drizzle Gateway em produção.

O Dockerfile em `docker/Dockerfile` gera o Prisma Client e o frontend e executa como usuário não-root. O build não precisa de domínio ou segredos. O Hono serve `dist/` com `serveStatic`; `/api`, `/admin`, `/health` e `/mcp` continuam reservados à API.

**Docker sem Compose:** informe `DATABASE_URL` com a conexão completa do banco externo, sem `POSTGRES_PASSWORD`. **Compose:** informe apenas `POSTGRES_PASSWORD` para a conexão; a URL é montada internamente. A mesma imagem aplica migrations antes de iniciar em ambos os modos. Veja o [exemplo sem Compose](docs/deployment.md#docker-sem-compose-banco-externo).

O Compose de desenvolvimento é independente: `docker/docker-compose.dev.yml`, com PostgreSQL e Drizzle Gateway. Leia o **[guia de deploy](./docs/deployment.md)** para primeiro administrador, atualizações, backups e execução fora do Dokploy; veja [ambiente](./docs/environment.md) para opções de mídia/S3.

## Documentação

- [Backend](./docs/backend.md)
- [Frontend](./docs/frontend.md)
- [Arquitetura](./docs/architecture.md)
- [Variáveis de ambiente](./docs/environment.md)
- [API de integração](./docs/api.md)
- [SDK TypeScript](./docs/sdk.md)
- [Chat — visão geral](./docs/chat/README.md)
  - [Contatos](./docs/chat/contacts.md)
  - [Conversas](./docs/chat/conversations.md)
  - [Etiquetas](./docs/chat/labels.md)
  - [Mensagens](./docs/chat/messages.md)
  - [Mídias](./docs/chat/media.md)
  - [Realtime e sincronização](./docs/chat/realtime.md)
- [MCP integrado](./docs/mcp.md)
- [Deploy](./docs/deployment.md)
- [Contribuindo](./CONTRIBUTING.md)
- [Segurança e relato de vulnerabilidades](./SECURITY.md)

## Licença

Zappaz Lite está disponível sob a [licença MIT](./LICENSE). Dependências e outros materiais de terceiros podem ter licenças próprias.
