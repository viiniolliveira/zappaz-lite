# Variáveis de ambiente

As configurações são de runtime do backend. O frontend não exige variáveis de ambiente: HTTP e Socket.IO usam a mesma origem. Nenhum segredo é exposto pelo Vite.

`server/src/config.ts` carrega o ambiente uma vez e o valida com Zod 4, usando os schemas de `config-schema.ts`. Todo código da API consome `config`, sem ler variáveis diretamente. O Prisma CLI reutiliza o schema de conexão e exige somente `DATABASE_URL`. Erros de configuração identificam a variável, sem exibir seu valor. Alterações exigem reinício.

Variáveis exclusivas de infraestrutura (`POSTGRES_PASSWORD` e `MASTERPASS`) são verificadas pelo Compose, não pela API. Variáveis do sistema operacional não fazem parte do schema da aplicação.

## Backend

Arquivo local:

```text
.env
```

Crie a partir do exemplo:

```bash
cp .env.example .env
```

Exemplos por cenário:

| Arquivo | Uso | Configuração do banco |
| --- | --- | --- |
| `.env.example` | Desenvolvimento local | `DATABASE_URL` local |
| `docker/.env.compose.example` | Produção com Compose/Dokploy | `POSTGRES_PASSWORD`; o Compose monta `DATABASE_URL` |
| `docker/.env.dockerfile.example` | Produção com Dockerfile e banco externo | `DATABASE_URL` completa |

Os exemplos não são carregados automaticamente. Os scripts locais de Docker continuam lendo `.env` na raiz: copie somente o exemplo do cenário escolhido para esse arquivo, sem sobrescrever configurações que precise preservar. No Dokploy, informe os valores em **Environment**. Arquivos reais de ambiente não devem ser versionados nem incluídos na imagem.

Para desenvolvimento, somente o segredo e a conexão do banco são necessários à API:

```env
CLIENT_SECRET=change-me
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

### `CLIENT_SECRET`

Segredo usado para geração e validação de tokens.

### `DATABASE_URL`

String de conexão PostgreSQL usada pela aplicação e pelos comandos do Prisma. No Compose de produção é montada internamente com a senha do banco; não precisa ser preenchida no Dokploy.

Com **Docker sem Compose**, informe `DATABASE_URL` com a URL completa de um PostgreSQL acessível pelo container; `POSTGRES_PASSWORD` não é necessário. Não há uma variável adicional `DB_URL`. `localhost` dentro do container aponta para o próprio container, não para o host. Veja o [exemplo de execução](deployment.md#docker-sem-compose-banco-externo).

### Produção / Dokploy

Copie os campos de `docker/.env.compose.example` para **Environment** no Dokploy:

```env
APP_URL=https://zappaz.example.com
CLIENT_SECRET=change-me
POSTGRES_PASSWORD=change-me
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-to-a-strong-password
# ADMIN_RESET_PASSWORD=true
```

- `APP_URL`: origem pública HTTPS da instalação, sem caminho, query, credenciais ou fragmento. A barra final é normalizada. É obrigatória em produção; no desenvolvimento o padrão é `http://localhost:5173`. Em produção, a CSP deriva dessa origem o destino WSS explícito de `connect-src`, inclusive a porta não padrão, mesmo quando o proxy entrega HTTP ao backend. Host e headers `Forwarded`/`X-Forwarded-*` não alteram esse destino. Em desenvolvimento/teste, a CSP usa a origem da requisição para preservar as portas locais dinâmicas.
- `CLIENT_SECRET`: segredo estável do Better Auth e dos cursores. Gere com `openssl rand -hex 32`; trocar o valor invalida cookies assinados e cursores. Integrações usam API Keys com escopo explícito.
- `POSTGRES_PASSWORD`: gere outro valor com `openssl rand -hex 32`. Use apenas caracteres seguros para URL (recomendado: hexadecimal), pois o Compose o inclui na conexão PostgreSQL. Alterar a variável não altera a senha de um banco já inicializado; faça a rotação no banco de forma coordenada.

`NODE_ENV` aceita `development`, `test` ou `production` (padrão: `development`; a imagem define `production`). `PORT` aceita inteiro de 1 a 65535 e tem padrão 3001. Valores vazios/inválidos são rejeitados, sem fallback silencioso. No Compose, a porta é fixada em 3001 e o caminho de mídia em `/app/storage/media`.

Não há token administrativo global: APIs administrativas exigem sessão Better Auth de usuário com papel `ADMIN`.

`TRUST_PROXY` é opcional e desativado por padrão. Ative somente quando a API aceitar conexões exclusivamente de um proxy confiável que sobrescreva `X-Real-IP`; caso contrário, o rate limit usa o IP da conexão TCP. `X-Forwarded-For` é ignorado.

Todas as flags aceitam somente `true` ou `false`, inclusive `TRUST_PROXY` e `ADMIN_RESET_PASSWORD`.

### `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_RESET_PASSWORD`

No primeiro startup com banco sem usuários, `ADMIN_EMAIL` e `ADMIN_PASSWORD` criam o administrador e sua conta `credential` Better Auth. Use senha de 8–128 caracteres; ela é armazenada com scrypt e não aparece nos logs. Após a criação, as variáveis podem ser removidas. Reinícios normais ignoram mudanças nessas credenciais e preservam a senha definida na interface.

Credenciais ausentes/vazias são tratadas como não configuradas; se informadas, devem ser válidas mesmo em reinícios normais. A criação inicial e os comandos administrativos exigem ambas. O reset exige ambas já na validação do ambiente.

`ADMIN_RESET_PASSWORD` tem padrão `false`. Para recuperação, defina `true`, informe o email atual de um administrador existente e uma nova senha, e faça redeploy. Isso revoga apenas os logins dessa conta, preservando os dados e integrações WhatsApp. Depois remova/desative a flag e remova a senha do ambiente; enquanto estiver ativa, todo reinício repete o reset. Veja [deploy](deployment.md).

**Atenção:** o seed remove usuários e sessões WhatsApp existentes. As credenciais são validadas antes de qualquer exclusão. O Compose aplica migrations, mas não executa seed automaticamente.

### Retenção automática

```env
# Inteiro positivo de dias ou off para desativar a limpeza automática correspondente.
MESSAGE_RETENTION_DAYS=90
WEBHOOK_LOG_RETENTION_DAYS=1
```

Quando ausentes, os padrões são 90 dias para mensagens e 1 dia para logs de webhook. Use `off` (minúsculo) em qualquer uma para manter esses dados indefinidamente, sem variável adicional. Valores vazios, zero, negativos, fracionários, textos diferentes de `off` e números fora do intervalo de datas suportado impedem a inicialização com erro indicando a variável.

A limpeza roda a cada hora com `Bun.cron`, na virada da hora; o prazo é calculado como dias de 24 horas a partir da execução. Alterações exigem reinício/redeploy. O Compose de produção repassa ambas as variáveis em runtime.

A retenção de mensagens remove também miniaturas e as mídias correspondentes pelo fluxo de limpeza existente. `off` não impede exclusões manuais, limpeza no logout/exclusão de sessão ou retentativas de remoção de arquivos. A reconciliação de mídias órfãs continua ativa, preservando arquivos de mensagens existentes, e a atualização da foto da própria sessão continua horária. Fotos de contatos são consultadas somente sob demanda, com cache de uma hora; não exigem variável de ambiente.

### Origens HTTP, MCP e Socket.IO

Em produção, CORS e Engine.IO permitem somente a origem de `APP_URL`. Host/Origin do adapter oficial MCP usam o hostname dessa URL, preservando sua proteção contra DNS rebinding. Clientes MCP sem `Origin` continuam sujeitos à autenticação e à validação de Host. Clientes MCP de navegador em outra origem não são permitidos por essa configuração integrada.

Em desenvolvimento, são aceitas também as origens localhost/127.0.0.1 nas portas 3001 e 5173; o MCP aceita os hosts locais, incluindo `[::1]`. Não são necessárias allowlists adicionais. Consulte [MCP integrado](mcp.md).

### Socket.IO

Engine.IO valida a origem antes do upgrade; autenticação usa cookie HttpOnly ou `auth.token`, nunca query. Path `/api/ws`, namespace `/`, uma instância. Assinaturas não sobrevivem à reconexão: cliente reassina e ressincroniza via REST.

### Tamanho máximo dos arquivos

```env
MEDIA_MAX_FILE_SIZE_MB=25
```

Limite por arquivo para upload e download, em MiB (1 MiB = 1.048.576 bytes). Quando a variável não é passada, o padrão é **25**. Aceita inteiro positivo; vazio, zero, negativo, fracionário ou valor cujo corpo base64 ultrapasse o tamanho de buffer suportado pelo runtime impedem o startup. Reinicie/reimplante após alterar. O Compose repassa a configuração em runtime, sem reconstruir o frontend.

O limite vale para anexos, gravações e imagens editadas, saída da conversão de áudio, fontes base64/URL e recuperação de arquivos do WhatsApp ou do armazenamento. O corpo multipart permite mais 1 MiB de metadados; o teto global HTTP/MCP/Bun é `4 × ceil(limiteEmBytes / 3) + 1 MiB`, para comportar base64 e JSON. Ajuste também o limite de corpo do proxy HTTPS, se houver. Limites próprios menores de autenticação, texto, HTML de prévias e respostas de webhook permanecem inalterados.

A interface consulta `GET /api/v1/media/limits` autenticado, sem receber segredos ou depender de `VITE_*`. Até a consulta concluir, anexos/gravação ficam indisponíveis; falhas não assumem silenciosamente 25 MiB. No downloader oficial do Baileys, a validação ainda ocorre após acumular o arquivo: a variável não implementa cancelamento nem limite durante a transferência. Reduzir o valor não apaga arquivos existentes, mas passa a rejeitar downloads acima do novo limite.

### Persistência privada de mídias (backend)

`MEDIA_STORAGE_ENABLED=false` é o padrão: somente metadados/thumbnail ficam no banco; download usa Baileys sob demanda da interface, sem download automático durante o sync ou a ingestão de mensagens. Miniaturas recebidas do WhatsApp são preservadas; se uma imagem não tiver miniatura, ela é gerada e salva no banco quando seu arquivo for solicitado. O arquivo completo não é persistido. Quando desativado, nenhuma credencial S3 é exigida e o driver não é criado para downloads/persistência. Booleanos aceitam somente `true` ou `false`.

O `.env.example` habilita explicitamente o armazenamento local (`MEDIA_STORAGE_ENABLED=true`); altere para `false` se não quiser persistir os arquivos.

O driver (`fs` ou `s3`), caminho e flags são validados mesmo com persistência desativada, pois exclusões explícitas também os utilizam. Campos S3 vazios são considerados ausentes; credenciais só são obrigatórias no startup quando a persistência S3 está ativa. Um endpoint informado deve ser uma URL válida.

Exceção intencional: excluir uma conversa limpa arquivos antigos mesmo com persistência desativada. Essa operação instancia os storages registrados e o driver configurado para remover o prefixo da conversa, incluindo órfãos. Mantenha raiz/bucket e credenciais acessíveis para essa limpeza; falhas deixam `mediaCleanup=pending` e retry durável a cada minuto. Não há novas variáveis para o worker. Não troque a raiz/bucket de um identificador enquanto houver arquivos ou limpezas pendentes.

Para disco: `MEDIA_STORAGE_ENABLED=true`, `MEDIA_STORAGE_DRIVER=fs`, `MEDIA_STORAGE_PATH=./storage/media`. Para S3: driver `s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; `S3_ENDPOINT` é opcional para AWS e obrigatório na configuração do provedor compatível. `S3_FORCE_PATH_STYLE=false` e `S3_SUPPORTS_ACL=false` por padrão.

Mesmo com persistência habilitada, os arquivos só são baixados e salvos na primeira solicitação, não durante o sync. Downloads posteriores reutilizam o arquivo persistido. Veja o [fluxo de mídia sob demanda](chat/media.md#persistência-miniaturas-e-downloads).

| Provedor | Endpoint/região | Opções |
| --- | --- | --- |
| AWS | Endpoint padrão, região do bucket | Bucket privado; ACL off para buckets com object ownership enforced |
| Cloudflare R2 | `https://ACCOUNT_ID.r2.cloudflarestorage.com`, região `auto` | ACL off; path-style conforme configuração do bucket |
| Supabase Storage | Endpoint S3 informado no painel, região do projeto | Credenciais S3 (não anon/service-role), path-style true, ACL off; gravação via `put(bytes)` |

Use raiz/bucket dedicado à aplicação: a reconciliação apaga arquivos órfãos com chaves de três segmentos após 24 horas, repetindo falhas na próxima execução. Arquivos usam `sessionId/conversationId/messageId`, com segmentos codificados e sem nome original. Mudar caminho/bucket mantendo o mesmo identificador (`local`/`s3`) exige migração operacional. Desativar armazenamento não apaga arquivos nem cria backfill; reads voltam a Baileys. Downloads obedecem a `MEDIA_MAX_FILE_SIZE_MB` (padrão 25 MiB); o downloader oficial não garante timeout total. Range Baileys baixa primeiro o arquivo completo; leitura FlyDrive ainda carrega bytes completos antes de recortar o range.

## Ferramentas locais

`MASTERPASS` protege o Drizzle Gateway, disponível apenas no Compose de desenvolvimento em `http://localhost:4983`. Configure-o no `.env` da raiz, sem arquivo separado. O Gateway conecta ao banco pelo host `postgres`, porta 5432, usuário/banco/senha `postgres`. Não há Gateway no Compose de produção.

## Frontend

O cliente usa URLs relativas. No desenvolvimento, o Vite encaminha `/api` (incluindo WebSocket e SSE), `/admin`, `/mcp`, `/health`, `/docs` e `/openapi.json` para a API local na porta 3001. No Dokploy, todo o domínio aponta para o serviço `app`, porta 3001. Não configure variáveis `VITE_*` nem argumentos de build por domínio.

## Segurança

- Nunca commite arquivos `.env` reais.
- Em desenvolvimento, use o `.env` da raiz; no Dokploy, use **Environment**. O Vite não expõe variáveis de ambiente da aplicação ao navegador.
- Use segredos fortes em produção.
- Em produção, cookies de autenticação devem usar `HttpOnly` e `Secure`.
- Quando usar credentials no CORS, a origem precisa ser explícita; não use `*`.
# Segredo de produção

Em produção, `CLIENT_SECRET` deve ter pelo menos 32 caracteres, com diversidade e sem placeholders. Gere 32 bytes aleatórios (64 caracteres hexadecimais): `bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde a saída no gerenciador de segredos; nunca em Git ou logs. Trocar este segredo afeta logins Better Auth. Senhas de administrador e API Keys são credenciais separadas.
