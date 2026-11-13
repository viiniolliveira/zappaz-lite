# AGENTS.md — `server/src/common/`

Contratos compartilhados: erros de domínio, handlers HTTP e schemas comuns.

## Como trabalhar

- Serviços/controllers devem lançar `AppError` (ou subclasse) em vez de montar resposta de erro manualmente.
- Toda resposta de erro segue `{ ok: false, error: { code, message, issues? } }`.
- `schema.ts` concentra schemas de domínio WhatsApp usados por módulos e services; não coloque lógica de banco aqui.
- Evite `any`; Biome trata `noExplicitAny` como erro.

## Áreas

### `errors/`

- `app-error.ts` é a base (`HTTPException` com `code` + `status`); crie subclasse por status (400, 401, 403, 404, 409, 422, 429) reutilizando `ERROR_CODES` de `error-codes.ts`.
- Use a subclasse mais específica (`BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `RateLimitedError`) e preserve `cause` ao encapsular erros de baixo nível.
- Não retorne JSON aqui: a serialização é do `http/error-handler.ts`.

### `http/`

- `error-handler.ts` é o único ponto de tradução de erro → JSON; ele já cobre `AppError`, `ZodError`, JSON inválido, Prisma `P2025`/`P2002` e `HTTPException`. Novos mapeamentos entram aqui, não em cada módulo.
- Logs: `4xx` como `warn`, `5xx` como `error`, com método/path no `extra`.
- `not-found-handler.ts` responde 404 JSON com `ROUTE_NOT_FOUND` para rotas não encontradas, inclusive API/admin/health.
- Não importe módulos de domínio nestes handlers para evitar ciclos.
