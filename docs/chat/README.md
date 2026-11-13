# Chat

O chat é a interface privada do Zappaz para conversar por uma sessão WhatsApp. Seus contratos REST continuam sob `/api/v1/session/:sessionId`; esta organização separa a documentação por domínio, não altera as rotas nem suas permissões.

## Guias por domínio

| Guia | Conteúdo |
| --- | --- |
| [Contatos](contacts.md) | Agenda local, identidade PN/LID, CRUD e painel de detalhes |
| [Conversas](conversations.md) | Visibilidade, busca, abertura, paginação, leitura e exclusão |
| [Etiquetas](labels.md) | Catálogo, vínculos, filtros e operações em lote |
| [Mensagens](messages.md) | Histórico, DTOs, citações, envio, mensagens rápidas e exclusão no WhatsApp |
| [Mídias](media.md) | Upload, gravação, miniaturas, downloads, galeria e persistência |
| [Realtime e sincronização](realtime.md) | Inscrições, revisão, reconexão, progresso e diagnóstico do sync |

A [API de integração](../api.md) documenta sessões, mensagens enviadas por número, grupos, webhooks e autenticação. Os contratos do chat também aparecem no Scalar em `/docs` e no `/openapi.json`, ambos autenticados. Os schemas executáveis dos DTOs ficam em `server/src/lib/chat-contract.ts`.

## Interface e organização técnica

A rota privada `/chat`, acessível pela sidebar, usa somente sessões reais. Sem sessão selecionada, inicia vazia; não há demonstração local nem envios simulados. No celular, lista e conversa alternam com botão para voltar. A tela usa toda a área disponível, sem barra superior própria; o seletor de sessão compartilhado com `/use` fica acima de “Conversas”.

A coluna lateral ocupa 320 px em `md` e 360 px em `lg` (`w-90`), mantendo largura total no celular. O painel de detalhes também ocupa 360 px ao lado da conversa (`xl` em diante), sem aumentar em `2xl`.

Schemas Zod 4 e merge por revisão ficam em `src/lib/chat/`; componentes por domínio em `src/components/chat/`, com balões compostos em `messages/`. A página conecta componentes e átomos. O fluxo é `atom → services → backend`, sem HTTP direto nos componentes. Fixtures fictícias existem apenas em `test/chat/`; os testes usam transporte simulado, sem afirmar aceite do WhatsApp ou downloads reais.

Setup e estrutura geral estão nos guias de [frontend](../frontend.md), [backend](../backend.md) e [arquitetura](../architecture.md). Configuração de armazenamento fica em [variáveis de ambiente](../environment.md#persistência-privada-de-mídias-backend).
