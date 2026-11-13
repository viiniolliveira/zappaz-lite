# AGENTS.md — `src/layouts/`

Cascas de rota: `AuthLayout` (login) e `DashboardLayout` (app autenticado).

## Como trabalhar

- `DashboardLayout` faz o guard de autenticação consultando `sessionsAtom`; em `401`, redirecione para `/sign-in` com `Navigate`.
- Layouts renderizam `<Outlet />`, chrome de navegação e estados globais (loading/erro). Não implementem telas nem busquem dados além do necessário ao guard.
- Novas rotas privadas entram como filhas do layout em `App.tsx`; rotas públicas ficam sob `AuthLayout`.
- Mantenha acessibilidade dos estados (texto `sr-only`, `role="alert"`).
- Evite duplicar `SidebarProvider`/providers: providers globais ficam em `components/app-providers.tsx`.
