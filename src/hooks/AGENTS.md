# AGENTS.md — `src/hooks/`

Hooks React reutilizáveis e sem conhecimento de domínio.

## Como trabalhar

- Nomeie arquivos e hooks em kebab-case/`use-*` (`use-mobile.ts` → `useIsMobile`).
- Hooks aqui devem ser genéricos; lógica de sessão/usuário pertence a `atoms/` ou `components/`.
- Sempre limpe listeners/timers no retorno do `useEffect`.
- Use o hook reutilizável `useDebounce` de `use-debounce.ts` nos filtros de busca, com atraso padrão de 500 ms e valor configurável pelo consumidor.
- Não faça chamadas HTTP em hooks; exponha estado e deixe o consumidor usar átomos.
- Prefira retorno tipado e estável para evitar re-renders desnecessários.
