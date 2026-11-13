# AGENTS.md — `src/pages/`

Entrada das rotas. As páginas do dashboard são carregadas com `lazy()` em `App.tsx`; login e 404 são importados direto.

## Como trabalhar

- A página é fina: compõe componentes de `components/` (ou locais em `<pagina>/components/`) e lê dados via átomos.
- Toda nova página precisa ser registrada em `src/App.tsx` (e na sidebar quando navegável).
- Componentes usados só por uma página ficam na subpasta dela, não em `components/`.
- Trate carregamento, erro e vazio na própria página; use `Spinner`, `Skeleton` e mensagens em pt-BR.
- Não adicione `QueryClientProvider`, `BrowserRouter` ou tema aqui: providers ficam em `main.tsx`/`app-providers`.
- Evite lógica de domínio na página; extraia para átomo, hook ou componente de domínio.

## `chat/`

- Mantenha os componentes do chat em `src/components/chat/`, como exceção à regra de componentes locais de página; deixe a página responsável pela composição e pelos átomos.
- Use o mesmo fundo da aplicação (`bg-background`) nas superfícies principais do chat.
- Ocupe toda a largura e altura disponíveis no dashboard, sem contêiner de largura máxima, margens externas ou moldura de card envolvendo o chat.
- Encoste o chat no menu lateral, sem espaçamento entre as áreas, e use uma borda fina à esquerda para separá-las no desktop.
- Não use barra superior própria no chat; coloque o seletor de sessão no topo da lista, acima do título “Conversas” e da busca.
- Marque como lida ao abrir a conversa e quando chegar mensagem nova enquanto ela estiver aberta; nunca dispare leitura por rolagem, reações ou atualizações de status.

## `session-detail/`

- Tela de `/sessions/:sessionId` e seus componentes locais em `session-detail/components/`.
- O `sessionId` vem de `useParams`; carregue a sessão com `getSessionByIdAtom`. Enquanto não estiver pronta, use `LoadingSession`; em erro, ofereça tentar novamente.
- O layout reúne cards independentes (configuração, webhooks, teste de mensagem, exclusão). Credenciais são gerenciadas na página Chaves de API, sem card de token. Cada card cuida do próprio estado e usa átomos de sessão/webhook.
- Componentes exclusivos da tela ficam em `session-detail/components/`; só promova para `src/components/` com reutilização real.
- Formulários seguem `react-hook-form` + Zod e enviam via `updateSessionAtom`. Dados sensíveis usam `CopyButton`, sem log no console.
- Ações destrutivas exigem confirmação, invalidação de cache e navegação de volta para `/sessions`.
