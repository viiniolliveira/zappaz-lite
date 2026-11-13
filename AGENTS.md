# AGENTS.md

# Regras de Qualidade e Manutenção de Código

Ao criar, modificar ou refatorar código, siga obrigatoriamente estas diretrizes:

## 1. Princípios fundamentais

- **KISS:** implemente a solução mais simples que resolva o problema corretamente.
- **DRY:** evite duplicação de lógica, mas não crie abstrações prematuras.
- **YAGNI:** não implemente funcionalidades, configurações ou extensibilidade que não foram solicitadas.
- **SOLID:** aplique seus princípios quando reduzirem o acoplamento e facilitarem a manutenção.
- **SRP:** cada função, classe ou módulo deve possuir uma responsabilidade clara.
- **Separation of Concerns:** mantenha regras de negócio, acesso a dados, validação e apresentação separados quando apropriado.
- **Composition over Inheritance:** prefira composição quando ela proporcionar maior simplicidade e flexibilidade.

## 2. Legibilidade

- Utilize nomes claros, descritivos e consistentes.
- Prefira funções pequenas e focadas, sem impor limites arbitrários de linhas.
- Utilize *early returns* para reduzir aninhamentos.
- Evite condições complexas, abreviações ambíguas e números mágicos.
- Priorize código explícito e previsível.
- Escreva comentários apenas quando agregarem contexto relevante, especialmente para explicar decisões e motivos.
- Respeite os padrões de nomenclatura e formatação existentes no projeto.

## 3. Arquitetura e organização

- Respeite a arquitetura atual do projeto.
- Mantenha alta coesão e baixo acoplamento.
- Organize responsabilidades de maneira clara, sem criar camadas desnecessárias.
- Reutilize funções, componentes e serviços existentes quando apropriado.
- Evite dependências circulares.
- Não introduza novos padrões arquiteturais sem necessidade concreta.
- Não crie abstrações para cenários hipotéticos.
- Prefira soluções locais e simples quando não houver necessidade de generalização.

## 4. Tipagem e segurança

- Utilize tipagem forte e explícita nos contratos públicos.
- Não utilize `any` para contornar problemas de tipagem.
- Evite conversões forçadas de tipos sem validação ou justificativa.
- Valide entradas externas nas fronteiras do sistema.
- Trate erros de forma explícita, consistente e previsível.
- Nunca silencie exceções.
- Não utilize fallbacks que ocultem erros reais.
- Evite efeitos colaterais inesperados.

## 5. Alterações no código

- Antes de implementar, analise os padrões e as soluções existentes.
- Modifique somente o necessário para atender à solicitação.
- Preserve o comportamento existente, exceto quando a alteração for intencional.
- Não realize refatorações fora do escopo sem necessidade.
- Não adicione bibliotecas quando uma solução simples com os recursos existentes for suficiente.
- Remova código morto diretamente relacionado às alterações.
- Evite alterações que aumentem a complexidade sem benefício concreto.
- O app ainda não foi publicado: mantenha somente o contrato e o fluxo atuais. Não adicione compatibilidade com versões antigas, adaptações de dados legados, reprocessamento na leitura, campos opcionais ou fallbacks apenas para aceitar formatos anteriores, salvo solicitação explícita. Ao mudar um contrato, atualize os produtores, consumidores, testes e documentação juntos, removendo o código substituído.

## 6. Testes e verificação

- Crie ou atualize testes para comportamentos relevantes.
- Cubra casos de sucesso, erros e situações limite quando aplicável.
- Priorize testes de comportamento em vez de detalhes internos de implementação.
- Execute os testes, o linter e a verificação de tipos disponíveis no projeto.
- Não ignore erros ou desabilite regras de qualidade apenas para fazer o código passar.
- Não afirme que uma verificação passou sem executá-la.

## 7. Performance

- Evite consultas, cálculos e operações redundantes.
- Considere o impacto de operações assíncronas, acesso ao banco e processamento de dados.
- Não introduza cache ou otimizações complexas sem necessidade comprovada.
- Priorize correção e legibilidade, otimizando gargalos identificados por evidências.

## 8. Comportamento esperado

- Não faça overengineering.
- Não crie arquivos, funções, classes ou interfaces desnecessárias.
- Não adicione funcionalidades além do solicitado.
- Não complique soluções para seguir padrões de projeto artificialmente.
- Quando houver múltiplas alternativas válidas, escolha a mais simples e consistente com o projeto.
- Antes de concluir, revise se o código pode ser simplificado sem prejudicar a clareza ou a funcionalidade.

## Regra principal

**Escreva código que outro desenvolvedor consiga entender, modificar e testar facilmente, sem precisar compreender uma arquitetura mais complexa do que o problema exige. A simplicidade, a clareza, a consistência e a facilidade de manutenção devem orientar todas as decisões técnicas.**

## Code standards

- Use [tweakcn](https://tweakcn.com/) to generate additional themes.
- Use Biome for frontend and backend linting, formatting and import organization, with the root `biome.json` configuration from `car-store-template`.
- Revise os avisos do Biome: corrija os problemas aplicáveis e configure no `biome.json` os avisos que podem ser ignorados para que deixem de ser exibidos.
- Use Bun as the only package manager. Keep dependencies in the root `package.json` and a single root `bun.lock`; do not create frontend/backend workspaces or nested manifests.
- Keep the default development environment example at the repository root (`.env.example`) and production examples in `docker/` (`.env.compose.example` and `.env.dockerfile.example`).
- Keep the frontend at the repository root (`src/`, `public/`, Vite config) and all backend code in `server/`.
- Keep backend routes that serve the built frontend in `server/src/modules/frontend/route.ts`; only register that module in `server/src/app.ts`.
- Keep application security protections in the code and document hosting requirements separately; leave TLS, certificates, HSTS, firewall and reverse-proxy configuration to the operator's hosting environment.
- Use Hono's official `serveStatic` middleware to serve frontend build files; do not implement custom file reading.
- Keep automated tests under the root `test/` directory, organized by area in subdirectories (for example, frontend-serving tests in `test/frontend/`), not under `server/` or `src/`.
- Keep `public/` for runtime static assets only; Vite publishes its contents verbatim, so never place documentation (including `AGENTS.md`), secrets, or source files there.
- Preserve the existing QR-code animation in `public/assets/qr-code-animation.svg`; do not redraw or replace it unless explicitly requested.
- Keep `prisma`, `@prisma/client`, and `@prisma/adapter-pg` on version 7; do not upgrade them to version 8. Keep their versions aligned (currently `7.8.0`).
- Use the latest Zod 4 release for both frontend and backend; import from `zod`, not the `zod/v3` compatibility entry point.
- Model chat like WhatsApp: keep one conversation per contact/JID within each session, store contacts separately, and do not introduce tickets or multiple attendances. Do not display groups in the chat interface.
- Keep internal conversation records from sync or manual opening, but display only conversations with persisted messages in the chat list. Apply this visibility rule to search, pagination, counts and realtime updates; preserve `unknown` messages and do not automatically delete empty records after sync.
- Keep the saved contact agenda separate from conversations: receiving messages creates only an internal identity, not a saved agenda entry. Perform contact CRUD only in Zappaz, never in WhatsApp; removing a saved contact must preserve its conversation, messages, media and internal PN/LID identity. Keep local names separate from WhatsApp-synchronized names.
- Persist contact profile-picture URLs and their successful lookup time in `WaContact.avatarCheckedAt`, including absence of a picture. Return the timestamp with conversations; request an update only when a conversation card is visible and the timestamp is null or at least one hour old. Do not scan all contacts for profile pictures during connection, sync or hourly jobs.
- Store a contact's phone number and LID separately when provided by WhatsApp; use `key.addressingMode` with `remoteJid`/`remoteJidAlt` to associate PN/LID within the session. Resolve either identifier to the same contact/conversation, preserve a known identifier when absent from later payloads, and never infer a phone number from a LID or associate contacts by name.
- In normalized message webhooks, always expose the phone-number JID in `remoteJid` and the LID in `lid`, regardless of the incoming addressing mode; include both fields and use `null` for an unavailable identifier. Preserve existing `chatId` and `sender.id` semantics.
- Store the WhatsApp message identifier in an indexed `WaMessage.messageId` column, separately from the internal message ID. Scope conversations and media by session and conversation.
- Persist whether a message contains a link in `WaMessage.hasLink`; use messages as the base for media, document and link library queries, joining media metadata when needed.
- Use FlyDrive for optional media-file persistence, selected by backend environment variables; keep persistence disabled by default and use the existing Baileys download flow when disabled. Store files under `sessionId/conversationId/messageId`.
- Configure the maximum upload/download file size with backend `MEDIA_MAX_FILE_SIZE_MB`; default to 25 MiB when omitted.
- Store the WhatsApp-provided base64 thumbnail in a `WaMessageMedia` column independently of file persistence, and expose it to the interface so it can render a preview while requesting the full file.
- Use Socket.IO for the chat interface's realtime updates.
- Delete conversations permanently on the Zappaz side, including their message history, thumbnails and stored media files; preserve the contact and do not delete the WhatsApp chat.

## Commands

- Install once at the repository root with `bun install`.
- Run both apps with `bun run dev`, or individually with `bun run dev:frontend` and `bun run dev:backend`.
- Run `bun run build` for both typechecks and the Vite production build.
- Run Prisma commands from the root using the `db:*` scripts; configuration is in `server/prisma.config.ts`.
- Keep user-facing environment configuration minimal and backend-only. Do not require `VITE_*` variables; serve frontend and API from the same origin, using the Vite proxy during development.
