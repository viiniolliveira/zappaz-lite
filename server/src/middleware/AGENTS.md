# AGENTS.md — `server/src/middleware/`

Middlewares Hono de autenticação, sessão, CORS e rate limit.

## Como trabalhar

- Separe autenticação em `auth.ts` e autorização por role em `role.ts`. Declare a autorização explicitamente nas rotas com `requireRole(['user', 'admin'])` ou `requireRole(['admin'])`, após o middleware de autenticação. Não reimplemente essas verificações em controllers.
- `session.ts` valida estado da sessão WhatsApp (`requireEnabledSession`, `requireConnectedSession`) consultando `whatsappService`.
- `cors.ts` exige origem explícita com credentials; nunca use `*` quando cookies estão habilitados.
- `rate-limiter.ts` expõe o limitador geral (`hono-rate-limiter`); login usa o rate limit nativo Better Auth. Use somente o IP confiável fornecido pelo transporte.
- Escreva middlewares com `createMiddleware<AppEnv>()`, tipando `c.get('user'|'token'|'session')`.
- Falhas devem lançar `UnauthorizedError`, `ForbiddenError` ou `BadRequestError` de `common/errors/`, não retornar JSON ad hoc.
- A ordem dos middlewares importa: rate limit → auth → existência da sessão → estado (enabled/connected).
