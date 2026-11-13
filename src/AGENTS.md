# AGENTS.md — `src/`

Frontend SPA (Vite + React 19 + React Router 7 + Tailwind 4). É servido por `server/src/modules/frontend/route.ts` em produção; em dev roda no Vite (5173) contra a API em 3001.

## Como trabalhar

- Use o alias `@/` para imports internos (`@/components/...`, `@/lib/...`). Imports relativos só para vizinhos do mesmo diretório.
- Rotas ficam em `App.tsx`. Páginas do dashboard são carregadas com `lazy()` + `Suspense`; telas simples (login, 404) podem ser importadas direto. Toda nova tela precisa de: página em `pages/`, rota em `App.tsx` e entrada na sidebar quando fizer sentido.
- Siga o fluxo `atom → services → backend`: átomos Jotai em `atoms/` chamam a camada de serviços em `services/`, que utiliza os clientes compartilhados de `lib/`. Não chame Axios direto em componentes ou átomos.
- Implemente todos os formulários com React Hook Form e validação Zod via `zodResolver`; consulte dados com `atomWithQuery` e envie alterações com `atomWithMutation` de `jotai-tanstack-query`.
- UI é composta com primitivas de `components/ui/`; estilos usam tokens do `global.css` e `cn()`.
- Use `bg-background` nos cards para manter o mesmo fundo da aplicação, sem contraste de superfície com `bg-card`.
- Textos de interface em português (pt-BR). Mantenha rótulos `aria-*` e estados de loading/erro/vazio.
- Não crie `package.json` nem lockfile: dependências ficam na raiz.
- Verificação: `bun run lint:frontend` e `bun run build:frontend` (ou `bun run build`) na raiz.
- `'use client'` é herança de shadcn e não tem efeito no Vite; não introduza esse padrão em arquivos novos.

## Diretórios

`atoms/` estado e cache · `services/` chamadas ao backend · `components/` UI por domínio · `hooks/` hooks reutilizáveis · `layouts/` cascas de rota · `lib/` clientes e utilitários · `pages/` entrada das rotas · `utils/` helpers puros.
