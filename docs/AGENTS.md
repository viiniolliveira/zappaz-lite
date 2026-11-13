# AGENTS.md — `docs/`

Documentação técnica em Markdown e pt-BR: arquitetura, backend, frontend, API, ambiente e deploy.

## Como trabalhar

- Ao mudar comportamento, rota, variável de ambiente ou fluxo de deploy, atualize o documento correspondente na mesma alteração.
- `api.md` descreve a API de integração (autenticação, sessões, mensagens por número, grupos e webhooks). Mantenha paths e payloads alinhados com `server/src/modules/*`, Better Auth e `src/services/`.
- `chat/README.md` é o índice do chat. Documente cada domínio em seu guia: `contacts.md`, `conversations.md`, `labels.md`, `messages.md`, `media.md` e `realtime.md`. Cada guia reúne regras, endpoints/payloads, interface e eventos relacionados; não duplique esses contratos em `api.md`, `frontend.md` ou `backend.md`.
- `frontend.md` e `backend.md` cobrem setup e estrutura técnica. `realtime.md` cobre o transporte compartilhado, invalidações globais e logs; eventos e sincronização específicos do chat ficam em `chat/realtime.md`.
- `environment.md` lista as variáveis; nunca inclua valores reais ou segredos, apenas exemplos (`change-me`).
- `architecture.md` usa Mermaid; se a estrutura divergir do código, corrija o texto em vez de criar um novo documento.
- Prefira editar o guia de domínio existente a criar outro com assunto sobreposto; use links para contratos compartilhados.
- README e CONTRIBUTING na raiz cobrem visão geral e setup; não duplique instruções longas aqui.
