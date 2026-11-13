# Frontend

O frontend fica na raiz (`src/`, `public/`, `vite.config.ts`) e é uma SPA construída com Vite, React 19, React Router 7 e Tailwind CSS 4. Compartilha dependências e o `.env` da raiz com a API em `server/`.

## Setup

```bash
cp .env.example .env
bun install
bun run dev
```

URL local comum: `http://localhost:5173`.

## Configuração

O frontend não exige variáveis de ambiente. HTTP e Socket.IO usam a mesma origem. No desenvolvimento, Vite encaminha paths da API à porta 3001, incluindo upgrades WebSocket. Em produção, Hono serve `dist/` e API juntos; configure domínio HTTPS no Dokploy e `APP_URL` no backend. Veja [ambiente](environment.md).

## Scripts

```bash
bun run dev
bun run build
bun run lint
bun run preview
```

## PWA e instalação

O build gera `manifest.webmanifest`, `sw.js` e o runtime Workbox usando `vite-plugin-pwa`. O aplicativo pode ser instalado pelo menu do Chrome/Edge ("Instalar aplicativo") ou, no Safari do iPhone/iPad, por **Compartilhar → Adicionar à Tela de Início**. Ele abre em janela independente na rota `/chat`, mantendo a autenticação normal. O ícone usa a marca do favicon, com versões PNG de 192/512 px, máscara de ícone adaptável e Apple Touch Icon de 180 px em `public/icons/`.

Service workers exigem HTTPS em produção (localhost é permitido para testes). Não há configuração adicional de ambiente. Em desenvolvimento (`bun run dev`), o service worker fica desabilitado; para testar a instalação local, use `bun run build` e `bun run preview`. O preview não executa a API; para testar login/chat completos, use o servidor Hono com o build ou o ambiente HTTPS publicado.

O precache contém apenas JS/CSS/fontes do build, ícones, manifest e `public/offline.html`. O HTML da SPA não entra no cache; navegações usam a rede e, se ela falhar, exibem a tela informativa de conexão. Não há cache de API, autenticação, conversas, contatos ou mídias, nem fila de envios offline ou notificações push. Temas não selecionados não são baixados pelo service worker. As preferências e os rascunhos locais já existentes não são alterados por esse mecanismo.

Atualizações ficam aguardando: o aviso **Nova versão disponível** oferece **Atualizar agora** (recarrega após confirmação) ou **Depois**, sem interromper o chat automaticamente. O cache estático antigo é limpo na ativação da nova versão. O backend serve worker e manifest com `Cache-Control: no-cache`, permitindo revalidação após deploy. Ao atualizar a marca, regenere os PNGs a partir do favicon, preservando a área segura do ícone `maskable`.

Os overrides de segurança de `minimatch` 10 devem permanecer na major 10 (`>=10.2.3 <11`): permitir a major 11 quebra o glob usado pelo Workbox e deixa os assets fora do precache. O teste de produção verifica que todos os chunks estão presentes no worker.

## Autenticação

“Minha conta” (`/account`) apresenta formulários independentes de dados pessoais e senha; troca exige senha atual, nova com pelo menos 8 caracteres e confirmação. A página “Chaves de API” (`/api-keys`) tem item próprio no menu, tabela com busca por nome e criação por modal. Permite escolher validade de 1 hora a 1 ano ou sem expiração; 90 dias é o padrão do formulário. Revogação é individual e confirmada. O segredo é exibido apenas na criação, fora do cache de consultas. Componentes locais ficam em `src/pages/api-keys/components/`; `src/atoms/api-keys.ts` usa os services e o plugin cliente oficial Better Auth. “Usuários” (`/users`) reúne administração, com menu/guard exclusivos para `ADMIN`. Backend mantém autorização própria.

Formulários usam React Hook Form, `zodResolver` e Zod 4. Consultas/alterações passam por `atomWithQuery`/`atomWithMutation`, sem HTTP direto nos componentes. Atualizar perfil sincroniza cache de conta/listagem administrativa; editar/remover usuário administrativamente invalida identidade autenticada.

Fluxo `atom → services → backend`: domínio em `src/services/`, clientes compartilhados em `src/lib/`. Auth/usuários usam cliente oficial Better Auth React (`createAuthClient`, `adminClient`) e tipos inferidos do servidor, mesma origem em `/api/auth`. Senhas usam scrypt nativo Better Auth.

Demais requisições usam Axios com `withCredentials:true`. Frontend não manipula cookie HttpOnly diretamente; backend cria/expira com `Set-Cookie`. Contratos de conta/admin estão na [API](api.md#autenticação).

## Aparência

“Minha conta” (`/account`) contém a seção **Aparência**, com temas e modos claro, escuro e sistema. O modo continua usando `next-themes`; a paleta é independente e seu ID fica na chave `zappaz-theme` do `localStorage`. A preferência é do navegador, não da conta no banco, e não sincroniza entre dispositivos.

A seleção de paleta usa um botão com o tema atual e suas amostras de cores. Ele abre um Popover com Command do shadcn, busca por nome, indicação do tema atual e estado “Nenhum tema encontrado.”. A seleção funciona por mouse ou teclado e fecha o popover; o botão fica desabilitado enquanto o CSS é aplicado. Claro/Escuro/Sistema permanecem separados.

O catálogo estático fica em `public/themes/themes.json`, com `id`, `name`, `file` (caminho local `/themes/<nome>.css`) e `preview`. A prévia contém `light` e `dark`, cada um com quatro cores CSS na ordem `primary`, `secondary`, `accent`, `muted`, extraídas das respectivas variáveis do arquivo. As amostras aparecem junto ao nome e acompanham o modo resolvido, inclusive Sistema, sem carregar os CSS de temas não selecionados. Ao alterar uma paleta, atualize também suas cores no JSON. Para adicionar um tema do tweakcn:

O catálogo inclui os 43 temas nativos exibidos no seletor do [tweakcn](https://tweakcn.com/editor/theme), com variantes clara/escura obtidas do registro público `https://tweakcn.com/r/themes/<id>.json`. O “default” nativo está como **Basic**, preservando o arquivo **Padrão** personalizado do projeto. Também inclui **Fallout**, **Shopify**, **Terminal** e **WhatsApp**, adicionados localmente, totalizando 48 opções. Temas pessoais salvos na conta do tweakcn não são importados automaticamente. Os arquivos são locais: o aplicativo não depende do tweakcn em tempo de execução.

1. Salve seu CSS em `public/themes/`, mantendo somente `:root { ... }` e `:root.dark { ... }` com os tokens claros/escuros. Não inclua `@import`, `@custom-variant`, `@theme`, `@layer` ou `@apply`: essas diretivas continuam no `src/global.css`, processado no build.
2. Mantenha os mesmos tokens dos outros temas e adicione o registro ao catálogo, com ID único e as quatro cores de prévia para cada modo. Preserve o registro `default`.
3. Publique o build normalmente. Fontes declaradas nos tokens precisam estar disponíveis no navegador; os temas não baixam fontes externas automaticamente.

A aplicação consulta o catálogo por service, valida os IDs/caminhos e restaura apenas temas presentes nele. Um ID removido volta ao tema padrão. A interface aguarda a paleta inicial para evitar mostrar o conteúdo com outro tema. Cada seleção carrega um `<link>` após o CSS principal, mantendo o tema anterior até o novo terminar; falhas apresentam erro e não substituem a preferência salva. O CSS dinâmico é público, sem dados de usuário ou segredos. O CSS base continua disponível se o carregamento inicial falhar.

## Realtime da aplicação

Área autenticada mantém Socket.IO compartilhado por sessões, chat e logs. Modal de conexão não faz polling. Eventos globais invalidam queries específicas; logs ao vivo atualizam lista diretamente. Na tabela paginada, agrupamento de 1 segundo refaz só primeira página ativa; demais oferecem “Novos logs disponíveis”. Veja [realtime](realtime.md).

## Documentação do chat

Regras, endpoints e comportamento da interface ficam no [índice do chat](chat/README.md), separados por [contatos](chat/contacts.md), [conversas](chat/conversations.md), [etiquetas](chat/labels.md), [mensagens](chat/messages.md), [mídias](chat/media.md) e [realtime/sincronização](chat/realtime.md). Este guia mantém somente setup e estrutura geral do frontend.
