# Backend

O backend fica em `server/` e é uma API em Bun, TypeScript, Hono, Prisma 7 e PostgreSQL. Dependências e comandos ficam na raiz do repositório.

## Setup

```bash
cp .env.example .env
bun install
bun run db:generate
bun run db:migrate:dev
bun run dev:backend
```

URL local padrão: `http://localhost:3001`.

## Limpeza no logout e na exclusão de sessão

Somente logout explícito, `DisconnectReason.loggedOut` e exclusão de sessão limpam histórico e pasta/prefixo de mídias. Quedas temporárias, erros 402/403/406, reinícios e limite de QR preservam mensagens/arquivos. Logout mantém cadastro, contatos e conversas internas; exclusão remove cadastro e dados relacionados. Contratos HTTP estão na [API](api.md#exclusão-definitiva-de-sessão).

`session-deletion.ts` compartilha limpeza dos fluxos. Usa storages registrados e exclusões pendentes, além do driver configurado, mesmo sem persistência ativa. Prefixo codificado termina em `/`, evitando apagar sessão com nome semelhante no S3. No filesystem, FlyDrive remove recursivamente raiz da sessão.

Gravações de mídia usam lock compartilhado por sessão; limpeza usa mesmo lock exclusivamente, impedindo downloads pendentes de recriar arquivos. Lock de ingestão só é adquirido após limpeza do storage. Banco é removido após arquivos; falhas propagam erro e preservam metadados para repetir. Logout aguarda eventos de dados em andamento, sem informar sucesso quando limpeza falhar.

## Tarefas de background e retenção

As tarefas usam `Bun.cron` dentro do processo, sem cron do sistema operacional. Limpeza de mensagens, reconciliação de mídias órfãs, limpeza de logs de webhook e atualização de fotos executam na virada de cada hora (`@hourly`), não uma hora após iniciar o servidor. Cada callback aguarda sua operação, impedindo sobreposição entre execuções da mesma tarefa.

A retentativa de exclusão de mídias de conversas roda ao iniciar e a cada minuto (`* * * * *`), sem sobrepor a execução inicial. A verificação de autorização do Socket.IO mantém seu intervalo de 15 segundos; esperas e timeouts não usam cron.

`MESSAGE_RETENTION_DAYS` e `WEBHOOK_LOG_RETENTION_DAYS` controlam a retenção em dias (padrões: 90 e 1). Cada variável aceita `off` para desativar sua limpeza automática, sem afetar exclusões explícitas, reconciliação de arquivos órfãos ou atualização de fotos. Valores inválidos impedem a inicialização. Consulte [configuração de retenção](environment.md#retenção-automática).

## Fotos de perfil

Fotos da própria sessão e dos contatos permanecem como URLs externas do WhatsApp, sem arquivos locais. Ao conectar e na rotina horária, o backend atualiza somente a foto da própria sessão. Fotos de contatos são consultadas sob demanda pelos cards visíveis de conversas com mensagens, com cache persistido de uma hora em `WaContact.avatarCheckedAt`; não há varredura geral de contatos. Consulte [fotos de contatos](chat/contacts.md#fotos-de-perfil).

Alterações são persistidas antes das notificações de invalidação das sessões ou do chat. URLs ausentes e respostas 404 removem a foto; falhas temporárias preservam a URL anterior. O logout explícito ou informado pelo WhatsApp limpa a URL da foto da sessão. Quedas temporárias preservam-na.

## Documentação de domínio

Contratos da [API de integração](api.md) são separados dos domínios do [chat](chat/README.md):

- [Contatos](chat/contacts.md): agenda e identidade PN/LID.
- [Conversas](chat/conversations.md): visibilidade, paginação, leitura e exclusão.
- [Etiquetas](chat/labels.md): catálogo e vínculos.
- [Mensagens](chat/messages.md): normalização, ingestão, envio e revogação.
- [Mídias](chat/media.md): upload, FFmpeg, persistência e downloads.
- [Realtime e sync](chat/realtime.md): eventos, reconciliação e diagnóstico de conflitos.

Conexão compartilhada e invalidações globais estão em [realtime da aplicação](realtime.md). Payloads externos permanecem em [webhooks](webhook-payloads.md).

## Variáveis

```env
CLIENT_SECRET=change-me
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

Em produção, configure também `APP_URL` com origem HTTPS pública. No Dokploy, Compose monta `DATABASE_URL` com `POSTGRES_PASSWORD`. Veja [ambiente](environment.md).

`config.ts` carrega e valida as variáveis com Zod 4; os schemas compartilhados ficam em `config-schema.ts`. Os consumidores usam sempre `config`, inclusive Prisma, mídias, CORS, MCP e Socket.IO. O Prisma CLI reutiliza apenas a validação de `DATABASE_URL`, sem exigir segredos da API. Docker sem Compose recebe a URL completa; ambos os modos de container aplicam migrations antes de iniciar.

## Scripts

```bash
bun run dev:backend
bun run start
bun run build:backend
bun run check:backend
bun run db:generate
bun run db:migrate:dev
bun run db:migrate:deploy
bun run db:migrate:reset
bun run db:seed
bun run db:create-admin
```

## Estrutura

```text
server/src/
├── app.ts
├── common/
├── db/
├── lib/
├── middleware/
└── modules/
```

## Prisma

Prisma Client gerado em `server/generated/prisma`, importado via `@generated/prisma`. CLI, client e adapter PostgreSQL alinhados em 7.8.0, sem upgrade para Prisma 8.

## Observação sobre seed

`bun run db:seed` remove usuários e sessões WhatsApp antes de recriar dados iniciais. Não use na instalação de produção: primeiro administrador é criado no startup com `ADMIN_EMAIL`/`ADMIN_PASSWORD` quando não há usuários. Recuperação usa `ADMIN_RESET_PASSWORD=true`; veja [deploy](deployment.md). `db:create-admin` continua disponível para contas adicionais.
## Logs seguros

`lib/logger.ts` instancia um único Pino central, com configuração, sanitização e saída compartilhadas. `baileysLogger` é um child desse logger, limitado ao nível `error`, sem outro transporte ou configuração independente. O middleware de acesso HTTP apenas seleciona método, pathname sem query, status e duração e envia esses campos ao mesmo logger; não registra headers ou corpo. A saída vai para stdout, com JSON em produção e `pino-pretty` no desenvolvimento; retenção e rotação pertencem ao ambiente de execução, não a arquivos criados pela aplicação.

`lib/log-sanitizer.ts` remove recursivamente credenciais, payloads, mensagens/conteúdo, configuração HTTP e buffers, inclusive em child bindings. Erros preservam tipo/código e causas sanitizadas, sem mensagem ou stack arbitrários. URLs em logs são reduzidas à origem. QR codes nunca são impressos, nem em desenvolvimento. Para diagnóstico, use contexto explícito seguro (operação, sessão e código), nunca dados reais em mensagens livres; a sanitização não substitui essa regra. Os registros de entrega de webhooks persistidos no banco são um recurso funcional separado desses logs operacionais; consulte [retenção](environment.md#retenção-automática).
