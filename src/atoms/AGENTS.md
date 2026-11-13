# AGENTS.md — `src/atoms/`

Estado global com Jotai. Cada arquivo cobre um domínio (`auth`, `session`, `users`, `webhook`, `message`, `ui`, `realtime-logs`).

## Como trabalhar

- Use `atomWithQuery` / `atomWithMutation` de `jotai-tanstack-query`; o `queryClientAtom` é hidratado em `components/query-client-provider.tsx`.
- Mantenha `retry: false` no `sessionsAtom`, usado pelo guard de autenticação.
- Exporte um objeto de chaves por domínio (`sessionKeys`, `authKeys`) e monte queries com `queryKey` derivado dele. Invalide essas mesmas chaves em `onSuccess` de mutations.
- Use `atomFamily` para estados parametrizados (por id de sessão, filtros de histórico) e passe a função de igualdade quando os parâmetros forem objeto.
- Siga o fluxo `atom → services → backend`: os átomos orquestram estado, cache e mensagens; os services realizam as chamadas. Para autenticação, conta e gestão de usuários, os services usam o `authClient` oficial do Better Auth.
- Estado puramente de UI (modais abertos, drawer, id selecionado) vai em `ui.ts` como `atom()` simples.
- Mantenha um único Socket.IO por aba durante toda a área autenticada, gerenciado por `realtime-app.ts` com `atomEffect`; encerre no logout. Chat e logs compartilham o socket e removem somente suas inscrições ao sair da tela ou fechar o modal.
- Receba eventos tipados `app.invalidate` após alterações confirmadas no backend, inclusive pela API externa e pelo WhatsApp; invalide somente as queries do recurso afetado. Preserve invalidação local de mutations e exclua somente a conexão de origem autenticada das notificações redundantes.
- Insira logs ao vivo diretamente na lista. Agrupe atualizações da tabela paginada em janelas de 1 segundo, refazendo somente a primeira página ativa; nas demais páginas, preserve os dados e ofereça voltar à primeira página quando houver atualizações. Agrupe também as invalidações de uso.
- Não coloque JSX aqui e não importe componentes.
