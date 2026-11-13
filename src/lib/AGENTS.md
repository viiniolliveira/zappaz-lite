# AGENTS.md — `src/lib/`

Utilitários e infraestrutura do frontend que não são componentes.

## Como trabalhar

- `utils.ts` expõe `cn()` (clsx + tailwind-merge); use-o para classes condicionais.
- `query-client.ts` é o `QueryClient` padrão; configurações globais de cache ficam nele.
- Não importe React nem átomos nesta pasta; mantenha funções pequenas, tipadas e sem efeitos colaterais.

## Áreas

### Clientes HTTP e Better Auth

- `api-client.ts` e `api-error.ts` implementam o transporte das APIs Zappaz; `auth-client.ts` configura o cliente oficial Better Auth React, `adminClient` e `inferAdditionalFields<typeof auth>()`.
- Mantenha os clientes HTTP e Better Auth em `lib/` e as chamadas de domínio em `src/services/`, no fluxo `atom → services → backend`. Os services de autenticação, perfil, senha e usuários usam `createAuthClient` com `adminClient`; os demais usam o cliente HTTP compartilhado.
- `API_URL` é vazio: use paths relativos na mesma origem, sem variáveis `VITE_*`. Em dev, o proxy do Vite encaminha HTTP/SSE/WebSocket à API. Não use `fetch` direto nem hardcode host nos consumidores.
- Services exportam funções finas por domínio; `src/services/types.ts` espelha os contratos Zappaz, e Better Auth infere seus contratos do servidor. Ao mudar uma rota, atualize consumidores e o guia correspondente: `docs/api.md` para integrações ou `docs/chat/` para contatos, conversas, etiquetas, mensagens, mídias e realtime do chat.
- Não dispare `toast` aqui — isso é responsabilidade dos átomos. Trate erro por `ApiError.status`.

### `utils/` — helpers puros

- Helpers de formatação/cálculo (hoje filtros de data), sem React, estado ou I/O.
- `getDateRangeFromFilter` usa chaves em pt-BR (`hoje`, `ontem`, `ultimos-7-dias`, ...); ao adicionar uma chave, atualize o componente de filtro correspondente.
- O retorno segue `{ startDate, endDate, granularity }` no formato aceito pela API; não altere o contrato sem ajustar `components/use` e o backend.
- Os formatos manuais de data são intencionais; preserve o comportamento ao refatorar e prefira `luxon` para cálculos novos.
