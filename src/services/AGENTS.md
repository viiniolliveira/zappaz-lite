# AGENTS.md — `src/services/`

## Padrão

- Siga o fluxo `atom → services → backend`; mantenha os átomos responsáveis por estado/cache e os services pelas chamadas.
- Organize os services por domínio. Use `authClient` de `@/lib/auth-client` para autenticação, conta e administração de usuários; use `request` de `@/lib/api-client` para as APIs Zappaz.
- Propague falhas para os átomos; não use React, Jotai ou `toast` nos services.
- Use a mesma origem e os clientes compartilhados; não replique o transporte do Better Auth.
