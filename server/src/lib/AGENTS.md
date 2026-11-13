# AGENTS.md — `server/src/lib/`

Infraestrutura de apoio usada pelos módulos e pelo serviço de WhatsApp.

## Como trabalhar

- `logger.ts`: use o Pino central `logger` para a aplicação e seu child `baileysLogger` para Baileys, compartilhando sanitização e saída; não instancie outro logger para a biblioteca. Em produção não há `pino-pretty`.
- `whatsapp-session.ts` e `baileys-auth-state.ts` encapsulam conexão/estado Baileys; não acesse sockets diretamente fora daqui e de `services/whatsapp.ts`.
- Use `downloadMediaMessage` oficial do Baileys para baixar mídias recebidas; não substitua o download e a descriptografia da biblioteca por uma implementação própria.
- Limpe as mensagens e toda a pasta/prefixo de mídias da sessão somente no logout (explícito ou informado pelo WhatsApp) e na exclusão da sessão. No logout, preserve o cadastro da sessão; nas demais desconexões, preserve mensagens e mídias. Remova também a pasta raiz vazia da sessão ao limpar os arquivos.
- Mantenha as fotos de perfil da sessão e dos contatos como URLs externas, sem persistir arquivos. Limpe a URL da foto da sessão no logout; preserve-a nas desconexões temporárias.
- `pub-sub.ts` (EventEmitter) alimenta logs no Socket.IO; publique eventos tipados e não exponha o emitter.
- Publique invalidações das entidades em `app-events.ts` após confirmar sua persistência, independentemente de a origem ser interface, API externa ou rotina interna. Não envie eventos de sucesso antes do commit; estados temporários como QR Code notificam após sua atualização em memória.
- `ttl-cache-store.ts`, `jid-creator.ts`, `vcard.ts`, `phone-number-formatter.ts`, `path.ts` e `webhook-log-*` são helpers; mantenha funções puras quando possível.
- `whatsapp-event-normalizer.ts` converte eventos do Baileys em estruturas internas (`NormalizedMessage`, status, recibos, reações); mantenha as funções puras e cobertas por `test/whatsapp/`.
- Reconheça os avisos internos ignoráveis na camada de normalização usando `WAMessageStubType` da Baileys. Preserve os demais tipos `unknown` e seu `rawContent` na persistência para permitir investigação; não descarte mensagens genericamente por serem `unknown`.
- Preserve em `replyTo` o conteúdo normalizado da mensagem citada quando ele for fornecido pelo Baileys, não apenas o ID.
- Use `Bun.cron` dentro do processo para tarefas agendadas de limpeza e background; preserve a revalidação de autorização do Socket.IO com seu intervalo de 15 segundos. Esperas como `waitUntil` e `sleep` continuam usando timers.
- Configure a retenção automática com `MESSAGE_RETENTION_DAYS` e `WEBHOOK_LOG_RETENTION_DAYS`: aceite inteiro positivo em dias ou `off`, sem flags adicionais; mantenha os padrões de 90 e 1 dias quando ausentes e rejeite valores inválidos no startup. `off` não desativa exclusões explícitas nem a limpeza de arquivos órfãos.
- `utils.ts` reúne tarefas agendadas (`runScheduledTasks`), esperas (`waitUntil`) e utilidades de mídia; cuidado com efeitos colaterais e timers.
- Não importe Hono/contexto HTTP aqui: esta pasta deve servir tanto rotas quanto tarefas de background.
