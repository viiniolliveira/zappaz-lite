# Deploy no Dokploy

Frontend e API rodam juntos, em uma instância Bun, com PostgreSQL 17 persistente. O Dokploy/Traefik cuida do domínio e HTTPS; não é necessário outro proxy na stack.

## Instalação

1. Crie um serviço **Docker Compose** no Dokploy, conectado ao repositório. Use o modo Compose (não Docker Stack/Swarm), com caminho `docker/docker-compose.prod.yml`. O build usa a raiz do repositório como contexto.
2. Em **Environment**, preencha os valores de `docker/.env.compose.example`:

   ```env
   APP_URL=https://zappaz.example.com
   CLIENT_SECRET=change-me
   POSTGRES_PASSWORD=change-me
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=change-me-to-a-strong-password
   # ADMIN_RESET_PASSWORD=true
   ```

   Gere dois segredos diferentes com `openssl rand -hex 32`. Para a senha do banco, use hexadecimal: ela é interpolada na URL de conexão. Não use os placeholders em produção. Não é necessário configurar `DATABASE_URL`, porta ou variáveis de frontend.
3. Em **Domains**, adicione o mesmo domínio de `APP_URL`, serviço **app**, porta **3001**, caminho `/`, com HTTPS/Let's Encrypt e redirecionamento HTTP → HTTPS. Aponte o DNS para o servidor. O domínio inteiro atende frontend, API, SSE, WebSocket e MCP.
4. Confira **Preview Compose**: `app` deve manter a rede privada `backend` e a rede externa `dokploy-network` do Dokploy; `postgres` fica somente em `backend`. Não habilite opções que removam essas redes. O Compose não publica portas no host nem adiciona labels manuais de proxy.
5. Faça o deploy. O banco precisa ficar saudável; depois a aplicação executa `prisma migrate deploy` e inicia. Nenhum seed/reset é executado. Confira os logs e `https://SEU_DOMINIO/health`.

O Dockerfile multi-stage usa Bun 1.4.4, Prisma 7.8.0 e ffmpeg, gera `dist/` e o Prisma Client e executa como usuário não-root. O `.env` nunca entra na imagem. O build não conecta ao banco e não depende do domínio público.

## Primeiro administrador

A migration inicial já cria as contas `credential` do Better Auth; não há conversão de credenciais de versões anteriores. `db:create-admin` não sobrescreve usuários existentes.

No primeiro deploy, informe `ADMIN_EMAIL` e `ADMIN_PASSWORD` no painel do Dokploy. O app cria o administrador automaticamente apenas quando o banco não possui usuários. A senha deve ter de 8 a 128 caracteres e é armazenada com o hash nativo do Better Auth.

Depois do login, você pode alterar a senha pela interface. Reiniciar ou fazer redeploy não sobrescreve essa senha, mesmo que `ADMIN_PASSWORD` ainda contenha o valor inicial. As credenciais do ambiente podem ser removidas após a criação.

### Esqueceu a senha?

1. No painel, defina `ADMIN_EMAIL` com o email atual de um administrador existente e `ADMIN_PASSWORD` com uma nova senha.
2. Defina `ADMIN_RESET_PASSWORD=true` e faça redeploy.
3. Faça login com a nova senha. Os logins anteriores dessa conta são revogados; usuários, dados e sessões WhatsApp são preservados.
4. Remova `ADMIN_RESET_PASSWORD` ou volte para `false` e remova `ADMIN_PASSWORD`. Com a flag ativa, **cada reinício redefine a senha e revoga os logins novamente**.

Email inexistente ou de usuário comum não cria nem promove contas durante o reset; o startup falha com mensagem explicativa. O comando manual `bun run db:create-admin` continua disponível para criar administradores adicionais, rejeitando emails já existentes.

**Não use `db:seed` em produção:** ele apaga usuários e sessões WhatsApp. Credenciais do primeiro administrador não são variáveis permanentes da aplicação.

## Mídias e dados persistentes

- `db-data`: banco, contatos, mensagens, thumbnails e credenciais das sessões WhatsApp.
- `media-data`: arquivos privados em `/app/storage/media`. Para gravá-los, adicione `MEDIA_STORAGE_ENABLED=true`; o padrão é desativado e o download usa Baileys. `MEDIA_MAX_FILE_SIZE_MB` configura o limite por arquivo de upload/download em runtime (padrão 25 MiB); ajuste também o teto de corpo do proxy para comportar base64/multipart, conforme [ambiente](environment.md#tamanho-máximo-dos-arquivos).
- S3 é opcional; consulte [ambiente](environment.md). Não exponha o volume como arquivos estáticos.
- Não use múltiplas réplicas ou rolling updates com processos concorrentes sobre as mesmas sessões WhatsApp. Esta configuração é de instância única.

Mantenha o nome/projeto da stack e seus volumes entre deploys. `down` preserva volumes; nunca execute `down -v` para atualizar a aplicação. Alterar a senha no Environment não muda a senha de um PostgreSQL já inicializado.

## Atualização e recuperação

1. Faça backup do banco e das mídias antes de atualizar.
2. Atualize a revisão Git no Dokploy e faça redeploy, preservando variáveis e volumes. As migrations pendentes são aplicadas antes de iniciar.
3. Valide `/health`, login, conexão de uma sessão, chat e logs em tempo real. Healthcheck falho indica problema, mas não é um mecanismo de restauração automática.

A instalação exige um banco PostgreSQL vazio. Aplique a migration inicial com `bun run db:migrate:deploy`; ela cria o schema e a proteção SQL do último administrador. Os comandos `db:migrate:reset` e `db:seed` apagam dados e são exclusivos de desenvolvimento; nunca os execute em produção ou para contornar uma migration com erro.

Para backup do banco, no terminal do serviço **postgres**:

```bash
pg_dump -U postgres -d postgres -Fc -f /tmp/zappaz.dump
```

Baixe o arquivo para armazenamento externo antes de recriar o container. Agende backups fora da stack e teste a restauração. Use os backups de volumes do Dokploy para `media-data`, coordenados com o dump do banco; volume persistente sozinho não é backup.

Para restaurar, pare o serviço `app`, transfira o dump para o container PostgreSQL e restaure em um banco vazio:

```bash
pg_restore -U postgres -d postgres --no-owner --exit-on-error /tmp/zappaz.dump
```

Restaure as mídias correspondentes, mantenha `CLIENT_SECRET` e credenciais S3 e só então inicie a aplicação. Não execute a restauração sobre um banco com dados que devam ser preservados. Reverter a imagem não desfaz migrations; rollback incompatível exige restauração do backup e da revisão correspondente.

## Desenvolvimento

O arquivo independente `docker/docker-compose.dev.yml` contém somente PostgreSQL e Drizzle Gateway, ambos publicados em loopback. Use o `.env` da raiz:

```bash
bun run docker:dev:up
bun run db:generate
bun run db:migrate:dev
bun run dev
```

Acesse o frontend em `http://localhost:5173`, API em `http://localhost:3001` e Gateway em `http://localhost:4983`. O Gateway usa `MASTERPASS` do mesmo `.env`; conecte ao banco com host `postgres` e credenciais locais `postgres`. `bun run docker:dev:down` para os serviços sem apagar volumes.

O desenvolvimento mantém PostgreSQL 14 para preservar o volume local existente; a nova produção usa PostgreSQL 17 em um volume separado. Não reutilize o diretório de dados entre versões principais: transporte dados por dump/restauração quando necessário.

## Comandos de produção fora da interface do Dokploy

Os comandos abaixo exigem Docker Compose, `.env` da raiz com os valores de produção e a rede externa `dokploy-network` já existente (criada pelo Dokploy):

Use `docker/.env.compose.example` como modelo para o `.env` da raiz. Copie-o somente se ainda não houver um `.env` a preservar e substitua todos os placeholders antes de iniciar. Os scripts continuam usando `--env-file .env`; o exemplo em `docker/` não é carregado automaticamente.

```bash
bun run docker:build
bun run docker:prod:up
bun run docker:prod:logs
bun run docker:prod:down
```

Eles usam o projeto `zappaz-prod`, separado do desenvolvimento. Não os misture com o projeto gerenciado pelo Dokploy: no servidor, prefira as ações do painel. A aplicação não expõe porta pública diretamente; o acesso é pelo proxy.

Fora do Docker, configure `DATABASE_URL`, `CLIENT_SECRET` e `APP_URL` HTTPS, execute `bun run db:generate`, `bun run db:migrate:deploy`, `bun run build` e `bun run start`, atrás de um proxy HTTPS.

### Validação isolada da imagem e do Compose

Execute na raiz, com Docker e Compose disponíveis:

```bash
docker build -t zappaz-security-verify:local -f docker/Dockerfile .
ZAPPAZ_DOCKER_TEST_IMAGE=zappaz-security-verify:local bun --no-env-file test ./test/docker
```

O teste de runtime é opt-in: sem `ZAPPAZ_DOCKER_TEST_IMAGE`, ele fica explicitamente ignorado; os testes de contrato continuam disponíveis. A imagem informada precisa ter sido construída a partir da revisão em teste. O teste não faz build nem usa o `.env` real: gera credenciais sintéticas em arquivo temporário privado, usa o Compose de produção com projeto/volumes exclusivos e substitui apenas a imagem e o nome da rede externa por uma rede descartável. Não publica portas nem monta diretórios do host.

A integração verifica healthchecks, usuário não-root, migrations, criação do primeiro administrador, login HTTP e Socket.IO real, bloqueios de autenticação/origem e persistência de banco/mídia após `down`/`up` sem remover volumes. Ao terminar, remove somente os containers, volumes e redes exclusivos do teste. O cache local `.bun`, dependências locais, `.env` e o client gerado localmente ficam fora do contexto de build.

Essas requisições são HTTP dentro do container, com origem HTTPS sintética e cookie repassado pelo teste; não comprovam TLS ou comportamento do navegador através do proxy. Ainda é necessário validar no Dokploy os certificados, redirecionamento HTTP → HTTPS, headers externos/HSTS, encaminhamento de IP confiável e upgrade WebSocket. A etapa não inclui varredura de vulnerabilidades dos pacotes do sistema operacional da imagem.

## Docker sem Compose (banco externo)

Use a mesma imagem com um PostgreSQL já disponível. Use `docker/.env.dockerfile.example` como modelo para o `.env` da raiz, sem sobrescrever um arquivo existente que precise preservar. Substitua todos os placeholders e não adicione o arquivo real ao Git:

```env
APP_URL=https://zappaz.example.com
CLIENT_SECRET=change-me-to-a-random-secret
DATABASE_URL=postgresql://user:password@database-host:5432/zappaz
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-to-a-strong-password
MEDIA_STORAGE_PATH=/app/storage/media
```

Não informe `POSTGRES_PASSWORD`: ele é usado apenas pelo Compose para provisionar o banco. A variável da aplicação e do Prisma é sempre `DATABASE_URL`, não `DB_URL`. O banco precisa aceitar conexões vindas do container; `localhost` não aponta para o host. No Docker Desktop, um banco no host pode ser acessado por `host.docker.internal`.

```bash
bun run docker:build
docker run -d --name zappaz --restart unless-stopped --init \
  --env-file .env \
  -p 127.0.0.1:3001:3001 \
  -v zappaz-media:/app/storage/media \
  zappaz-api
```

A imagem define `NODE_ENV=production`, aplica migrations no banco informado e inicia a aplicação somente se elas concluírem. Não executa seed. Aponte um proxy HTTPS para a porta 3001 e mantenha `CLIENT_SECRET` e o volume entre atualizações. O primeiro administrador segue as mesmas regras do Compose; remova suas credenciais após a criação. Para gravar mídias, habilite `MEDIA_STORAGE_ENABLED=true`.

Referências: [domínios Compose no Dokploy](https://docs.dokploy.com/docs/core/docker-compose/domains) e [variáveis de ambiente](environment.md).
# Requisitos de segurança

Gere `CLIENT_SECRET` com 32 bytes criptograficamente aleatórios, conforme `docs/environment.md`; a aplicação rejeita valores curtos, repetitivos e placeholders em produção. Configure HSTS no proxy HTTPS (comece com `max-age=86400` e aumente gradualmente, sem `includeSubDomains` ou `preload` até verificar todos os subdomínios). Quando `TRUST_PROXY=true`, restrinja acesso direto ao backend e faça o proxy sobrescrever `x-real-ip`.
## Cabeçalhos de segurança no proxy

A API aplica CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, política de referenciador e Permissions-Policy. A SPA permite scripts da própria origem, estilos inline necessários aos componentes, imagens HTTPS/data/blob, mídia local/data/blob e embeds YouTube. `frame-src` fica restrito aos domínios YouTube; PDFs usam canvas, não iframe/objetos. Isso não libera frames arbitrários ou o enquadramento da aplicação por outros sites. Socket.IO fica limitado à própria origem. A documentação Scalar usa nonce por resposta e permite seu CDN somente em `/docs`; não habilite `unsafe-eval` ou scripts inline globais para contornar violações.

Em produção, o destino WebSocket explícito de `connect-src` é derivado de `APP_URL` validada, convertendo HTTPS em WSS. Não depende do protocolo HTTP interno nem de Host/headers de encaminhamento, e preserva portas não padrão. Aplique a mesma origem pública em `APP_URL` e no domínio usado pela interface; não amplie a CSP para corrigir uma configuração divergente. Em desenvolvimento/teste, a política acompanha a origem da requisição para suportar portas locais dinâmicas.

TLS, certificados/renovação, redirecionamento, HSTS, firewall, isolamento de rede e configuração de limites/headers do proxy são responsabilidade do operador no provedor escolhido. O código mantém suas próprias validações, autenticação, limites e política CSP; não configura a infraestrutura nem depende de APIs do Dokploy em runtime.

O frontend inicializa o Zod com `jitless: true` em `src/configure-zod.ts`, importado antes dos módulos que criam schemas. Isso evita a detecção/compilação por `Function()`, incompatível com a CSP, sem alterar os contratos de validação ou permitir `unsafe-eval`.

O visualizador de PDF usa React-PDF/PDF.js com worker e recursos auxiliares locais (`/pdfjs/`). `script-src` inclui somente a exceção `wasm-unsafe-eval` para os decodificadores WebAssembly; JavaScript `eval`/`Function()` continuam bloqueados. Não substitua essa exceção por `unsafe-eval`. Os bytes do documento vêm do download autenticado existente, sem liberar novas origens em `connect-src`.

Execute `bun --no-env-file test ./test/security` com Google Chrome disponível para validar a CSP com um build de produção e autenticação sintética isolados, sem banco ou WhatsApp reais. O teste cobre login, navegação inicial de Sessões/Chat, probes de mídia/microfone/WebSocket/worker e bloqueios de scripts, conexões e enquadramento. Não substitui a validação de uma conversa real, dos componentes completos de gravação/edição/galeria ou do Socket.IO da aplicação atrás do proxy de produção.

Configure **HSTS no terminador HTTPS**, não no serviço HTTP interno. Após validar HTTPS e renovação de certificados, comece com `Strict-Transport-Security: max-age=86400` e aumente gradualmente. Não habilite `includeSubDomains` nem `preload` sem inventariar todos os subdomínios, confirmar suporte HTTPS permanente e aprovar o impacto operacional. O backend não ativa HSTS automaticamente. Valide os headers externos após passar por CDN/proxy, pois eles podem substituí-los. O frontend Vite de desenvolvimento não representa a política CSP da SPA servida em produção.
