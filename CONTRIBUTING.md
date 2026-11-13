# Contribuindo

Obrigado por contribuir com o Zappaz Lite.

## Setup local

1. Configure o ambiente e instale as dependências:

   ```bash
    cp .env.example .env
    bun install
   ```

   Edite `.env` e defina segredos únicos, `ADMIN_EMAIL` e uma senha forte em `ADMIN_PASSWORD` antes de iniciar a aplicação. Consulte o [README](README.md#setup-local).

2. Suba PostgreSQL e Drizzle Gateway locais e prepare o banco:

   ```bash
    bun run db:up
    bun run db:generate
    bun run db:migrate:dev
   ```

3. Inicie frontend e backend:

   ```bash
    bun run dev
   ```

## Desenvolvimento

A partir da raiz do projeto:

```bash
bun run dev:backend
bun run dev:frontend
```

Use apenas a instalação da raiz e mantenha Prisma CLI, client e adapter alinhados na versão 7.

## Checklist antes de abrir PR

- [ ] O backend passa no typecheck/build: `bun run build:backend`
- [ ] O frontend gera build: `bun run build:frontend`
- [ ] O lint do frontend passa: `bun run lint:frontend`
- [ ] O lint completo passa: `bun run lint`
- [ ] Os testes relevantes passam: `bun run test`
- [ ] Migrations do Prisma foram criadas quando necessário
- [ ] O README ou arquivos em `docs/` foram atualizados quando houve mudança de comportamento

## Padrões gerais

- Mantenha mudanças pequenas e focadas.
- Evite misturar refatoração com alteração de regra de negócio.
- Não commite arquivos `.env` reais, builds ou `node_modules`.
- Preserve o copyright e os avisos de licença aplicáveis ao projeto e a materiais de terceiros.
- Para vulnerabilidades, siga [SECURITY.md](SECURITY.md) em vez de abrir uma issue pública.

Ao enviar uma contribuição, você concorda que ela seja disponibilizada sob a [licença MIT](LICENSE).
