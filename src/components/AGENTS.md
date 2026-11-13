# AGENTS.md — `src/components/`

Componentes React da SPA, agrupados por domínio. Primitivas genéricas ficam em `ui/`; o resto é específico do produto.

## Como trabalhar

- Antes de criar algo novo, procure um componente equivalente em `ui/` ou no subdiretório do domínio.
- Componentes consomem átomos (`@/atoms/*`) e helpers (`@/lib/*`); não chamem a API direto.
- Siga o padrão do arquivo vizinho para export (`default` em cards/modais/páginas de feature, `named` em `ui/` e `layout/`), para imports e para nome de arquivo.
- Estilos só com classes Tailwind e tokens do tema; combine classes condicionais com `cn()`.
- Preserve acessibilidade: `aria-label`, foco visível, `role="alert"`/`role="status"` e `sr-only` para textos de loading.
- Não mova código compartilhado para cá sem reutilização real; `pages/` pode ter componentes locais em `pages/*/components/`.
- Textos em pt-BR. Ícones de `lucide-react`.
- Verificação: `bun run lint:frontend` e `bun run build:frontend` na raiz.

## Áreas

### `chat/`

- Mantenha os componentes da interface de chat nesta pasta, inclusive os exclusivos da página.
- Nos formulários de criação e edição de contato, reutilize `ui/phone-input/phone-input.tsx`, o mesmo `PhoneInput` usado em `/account`.
- Abra as informações do contato ao clicar no avatar/nome do cabeçalho da conversa. Mantenha o cabeçalho do painel na mesma altura do cabeçalho da conversa, inclusive durante a edição. Faça a edição no próprio painel lateral, reutilizando o formulário de contato; não ofereça “Editar contato” nos menus dos cards da lista de contatos.
- Sem conversa selecionada, faça o estado vazio ocupar toda a área disponível da conversa e mantenha seu conteúdo centralizado horizontal e verticalmente.
- Use o Context Menu do shadcn, instalado via CLI com Bun, no card de contato/conversa; abra as ações com o botão direito e mantenha a opção de excluir dentro desse menu.
- Use composição para mensagens: separe estrutura do balão, conteúdo por tipo, citação, reações e metadados; não concentre todos os tipos em um componente monolítico.
- Siga o design dos componentes de mensagem existentes ao renderizar templates e mensagens interativas; reutilize texto, mídia, tokens e botões do chat. Ao clicar numa resposta rápida, envie o texto da opção como resposta citando a mensagem original.
- Compartilhe o Socket.IO da área autenticada, gerenciado por `src/atoms/realtime-app.ts`; componentes não abrem conexões nem registram listeners por mensagem.
- No chat, use um switcher de sessões no padrão TeamSwitcher do shadcn, com avatar, nome e status em duas linhas e menu de sessões. Coloque-o em um header de mesma altura e divisória dos headers da conversa e dos detalhes do contato, sem label externo “Sessão”. Preserve `sessions/session-select.tsx` para a página `/use`.
- Não exiba abas para alternar entre conversas e contatos. Abra a lista de contatos somente pelo botão “Nova conversa” (balão com +) e ofereça nela um botão “Voltar para conversas”.
- Exiba atualizações de conexão e sincronização em toasts Sonner por mudança de estado, sem rodapé na lista; mantenha o indicador compacto no seletor de sessão. Atualize IDs estáveis por sessão, mantenha loading durante o sync e remova os avisos ao trocar de sessão ou sair do chat.
- Renderize stickers sem balão, borda ou fundo atrás da imagem; mantenha horário e status separados abaixo.
- Renderize mensagens de imagem e vídeo com padding reduzido no balão e horário/status sobrepostos à mídia no canto inferior direito, sem bloquear os controles do vídeo.
- Faça a imagem definir a largura do balão; quebre a legenda e links longos dentro dessa largura, sem alargar o balão. Durante o carregamento, exiba a miniatura ampliada com um spinner central e reserve espaço para reduzir saltos ao mostrar a imagem completa. Quando a imagem estiver indisponível, use a largura da miniatura ou do placeholder.
- Use skeletons durante o carregamento de mídias sem prévia disponível e das listas de miniaturas; preserve as miniaturas já disponíveis e remova os skeletons ao concluir ou falhar o carregamento.
- Limite a largura dos cards de prévia de link e defina uma largura mínima para evitar cards estreitos demais; em telas menores, respeite o espaço disponível sem transbordar o balão.
- Renderize mensagens de documento com padding reduzido no balão, como no WhatsApp; mantenha horário e status de leitura dentro do card do documento, acima dos botões.
- Renderize cards de contato com visual semelhante ao documento, padding reduzido e ações abaixo dos dados. Consulte a agenda da sessão pelo telefone: exiba apenas “Enviar mensagem” para contatos salvos e também “Salvar contato” para os demais; oculte a ação de salvar após o salvamento.
- Agrupe sequências de mais de três imagens/vídeos do mesmo remetente em uma grade de duas colunas; preserve os metadados de cada mensagem e não misture conversas, sessões ou dias.
- Abra imagens, vídeos e documentos em uma galeria de tela inteira da conversa selecionada, com miniaturas e opção de carregar mídias anteriores sob demanda.
- Ordene a galeria cronologicamente da mídia mais antiga para a mais recente, da esquerda para a direita, preservando a mídia selecionada ao abrir e paginar.
- No mobile, exiba o modal da biblioteca de mídias em tela inteira, sem margens externas nem cantos arredondados.
- No modal e no painel lateral da biblioteca, carregue as próximas páginas por rolagem infinita dentro do conteúdo. No modal, mantenha a grade de mídia rente às laterais e à parte inferior, sem moldura externa.
- Mantenha áudio, imagem e vídeo juntos na aba Mídia do painel lateral e permita abrir os três tipos na galeria de visualização existente. Na grade Mídia do modal de todas as conversas, exiba somente imagens e vídeos.
- No resumo e na biblioteca lateral do contato, exiba somente a miniatura disponível ou um ícone do tipo de mídia quando ausente ou inválida; carregue o arquivo completo somente ao abrir o visualizador. No modal da biblioteca de todas as conversas, carregue imagens e vídeos quando os cards ficarem visíveis, substitua a miniatura pela mídia carregada sem reproduzir vídeos automaticamente e reutilize o blob ao abrir o visualizador.
- Na aba Links da biblioteca, limite a prévia do texto da mensagem às duas primeiras linhas, sem alterar o texto original.
- Na aba Links do modal da biblioteca, limite o título a uma linha com reticências, preservando seu texto completo.
- Abra o visualizador de PDF somente por uma ação explícita de abrir o documento; navegar pela galeria ou selecionar uma miniatura não deve abri-lo automaticamente.
- Ao abrir uma conversa e após enviar uma nova mensagem pela interface, role o histórico até a última mensagem, mesmo se a pessoa estiver lendo mensagens anteriores. Mantenha o fim visível durante o carregamento inicial das mídias; ao apenas receber mensagens ou atualizações, preserve a posição de quem subiu para ler o histórico.
- Use o Video Player Pro da Ruixen, instalado via CLI shadcn com Bun, para reproduzir vídeos na galeria do chat.
- Use o Audio Player do registry audiocn, instalado pelo CLI shadcn, como base para o player de áudio do chat; centralize o botão de play verticalmente em relação ao avatar.
- No editor de imagens do chat, habilite todas as ferramentas do Image Ultra; no desktop, exiba apenas os ícones da barra de ferramentas e mostre o nome da ferramenta em um tooltip ao passar o mouse, como no car-store-template.
- Com o editor de imagens aberto, oculte as faixas externas de preparação/cancelamento e mantenha apenas o X nativo do Image Ultra.
- Apresente o compositor como uma superfície flutuante arredondada sobre o fundo do chat, sem borda horizontal nem faixa de fundo separando-o do histórico.
- Use o Tooltip do shadcn nos botões abaixo do input do chat, em vez do atributo `title` nativo.

### `ui/` (inclui `ui/phone-input/`)

- Primitivas shadcn (`components.json`: `base-nova`, base neutral, Tailwind 4, lucide), sem regra de negócio.
- Habilite `richColors` no Toaster do Sonner para exibir as cores semânticas dos avisos.
- Adicione pelo CLI (`bunx shadcn@latest add <nome>`) e ajuste com `cva` + `cn()`; exporte `named` e preserve a API pública.
- Não importe `@/atoms`, `@/lib/zappaz` nem páginas; dados chegam por props.
- Use tokens (`bg-primary`, `text-muted-foreground`, ...) e encaminhe `aria-*`, `disabled` e `ref`.
- `phone-input/` é wrapper de `react-phone-number-input`: compatível com `FormField`/`FormControl`, sem validação própria (Zod fica no formulário).

### `account/`

- Dados e senha da própria conta; dados/mutations de `@/atoms/auth`, formulários com `react-hook-form` + Zod.
- Mantenha dados pessoais e alteração de senha em formulários separados. A alteração de senha exige a senha atual, validada no backend.
- Na seleção de tema de Minha conta, use um dropdown com Popover e Command do shadcn, com busca, amostras de cores e indicação do tema atual; feche o popover ao escolher e mantenha Claro/Escuro/Sistema separados.

### `users/`

- Administração de usuários; dados/mutations de `@/atoms/users`, formulários com `react-hook-form` + Zod.
- Mantenha o telefone opcional na criação e edição de usuários; valide apenas quando preenchido e permita remover o telefone existente.
- Exclusão com `DeleteManagedUserDialog`; feedback por `toast`; paginação via `TablePagination` de `components/logs/`.
- Tela restrita a ADMIN: trate erro/permissão sem quebrar a página.

### `auth/`

- Formulário de login com `loginAtom`; não leia/grave/decodifique cookie (cookie HttpOnly + `withCredentials`).
- Validação Zod, mensagens pt-BR, estado de loading e bloqueio de duplo submit.
- Após sucesso, navegue para `/sessions` com `useNavigate` (padrão atual).

### `layout/`

- Casca autenticada: sidebar, usuário, logout e tema. Nova rota exige item aqui e rota em `App.tsx`.
- Use `components/ui/sidebar` e `useIsMobile`; não reimplemente colapso/responsividade.
- Logout usa `logoutAtom` e recarrega para `/sign-in`; ícones precisam de `aria-label`.

### `sessions/`

- Cards e modais de sessão; use `@/atoms/session` e `@/atoms/ui` (modais).
- Acompanhe conexão/QR por consulta inicial e invalidações do Socket.IO global, sem polling; fechar o modal não encerra o socket nem a sessão WhatsApp.
- Status é string da API (`open` = conectada); rótulo/cor/`aria-label` consistentes com `SessionCard`.
- Mantenha `skeleton-cards` sincronizado com o grid; ações destrutivas pedem confirmação e invalidam o cache.

### `logs/`

- Filtros, tabela, detalhe e retry de logs; dados de `@/atoms/webhook`, filtros com `react-hook-form` + Zod.
- Datas vêm de `@/lib/utils/date-filter`; JSON com `JsonPreview`; loading com `SkeletonsLogs`.
- `TablePagination` é compartilhado com `users/`; mudanças afetam as duas telas.
- Atualize a primeira página de logs no máximo uma vez por segundo por eventos; nas páginas seguintes, preserve a posição e mostre “Novos logs disponíveis”, com ação para atualizar e voltar à primeira página.

### `logs/realtime/`

- O átomo `@/atoms/realtime-logs` inscreve o drawer no Socket.IO compartilhado; aqui só se lê estado e logs.
- Ao abrir os logs em tempo real, selecione o log mais recente disponível na lista e exiba seus detalhes automaticamente.
- Nunca abra conexão em `useEffect`; fechar o drawer remove apenas sua inscrição, preservando a conexão global.
- Drawer usa `Drawer` + `useResizableDrawer`; estados vazio/erro têm componentes próprios; retry via átomo + `toast`.

### `magicui/`

- Efeitos visuais puramente apresentacionais; sem átomos, API ou regra de negócio.
- Animação com `motion/react`, `className` via `cn()` e respeito a `prefers-reduced-motion`.
- Não use efeitos contínuos em fluxos críticos que prejudiquem leitura/contraste.

### `use/`

- Tela de consumo: filtros de sessão/período e gráficos; dados de `getSessionHistoryAtom`.
- Use `getDateRangeFromFilter` e `SelectDateFilter`/`SelectSessionUse`; transformação de série em `useChart`.
- Gráficos com `recharts` e tokens `--chart-*`; trate loading, erro e ausência de dados.
