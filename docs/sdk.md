# SDK TypeScript

O pacote [@zappaz/zappaz-lite-sdk](https://www.npmjs.com/package/@zappaz/zappaz-lite-sdk) integra mensagens, mídias, grupos, perfil, privacidade e webhooks da API Zappaz Lite. É um pacote ESM com declarações TypeScript, sem dependências de execução e baseado em `fetch` nativo.

Este guia usa a versão publicada **0.2.0**. Consulte o [repositório do SDK](https://github.com/viiniolliveira/zappaz-lite-sdk) e as declarações da versão instalada para a referência completa. Os testes do pacote usam fixtures e servidores locais; valide a integração com uma sessão WhatsApp real antes de produção.

## Pré-requisitos

- API Zappaz Lite acessível, com HTTPS em produção.
- Sessão existente, habilitada e conectada para operações WhatsApp.
- API Key autorizada, preferencialmente restrita à sessão.
- Runtime com Fetch, Web Crypto e AbortController. O SDK foi exercitado com Bun 1.4.3 e Node 25.2.1; outras versões não foram certificadas.

O SDK não inclui o servidor Zappaz nem cria sessões. Não cobre administração, chat, agenda local, Socket.IO ou MCP. Use-o somente no servidor, nunca no frontend.

## Instalação

No projeto consumidor, não neste repositório:

```sh
bun add @zappaz/zappaz-lite-sdk
```

Configure as variáveis no servidor da integração, sem versionar valores reais:

```dotenv
ZAPPAZ_BASE_URL=https://zappaz.example.com
ZAPPAZ_API_KEY=SUBSTITUA_PELA_CHAVE
ZAPPAZ_SESSION_ID=SUBSTITUA_PELA_SESSAO
ZAPPAZ_WEBHOOK_SECRET=SUBSTITUA_PELO_SEGREDO
```

Essas variáveis são do projeto consumidor; não são novas configurações obrigatórias da aplicação Zappaz Lite. `baseUrl` é a origem da API, sem acrescentar `/api/v1`; localmente, use `http://localhost:3001`.

## Enviar mensagens

```ts
import { Zappaz } from '@zappaz/zappaz-lite-sdk'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`)
  return value
}

const zappaz = new Zappaz({
  baseUrl: env('ZAPPAZ_BASE_URL'),
  apiKey: env('ZAPPAZ_API_KEY'),
  sessionId: env('ZAPPAZ_SESSION_ID'),
  timeoutMs: 10000,
})

await zappaz.messages.sendText({
  number: '5511999999999',
  message: 'Seu pedido foi confirmado!',
})

await zappaz.messages.sendDocument({
  number: '5511999999999',
  source: 'https://example.com/pedido.pdf',
  fileName: 'pedido.pdf',
})
```

Use uma instância por sessão. Somente enviar não exige `webhookSecret`. Mídias aceitam URL pública, base64 ou data URL, não caminho local; os limites e a política de saída são aplicados pela API. Um envio aceito não garante entrega ao destinatário.

Há também métodos para imagem, vídeo, áudio, contato e localização, edição/exclusão e downloads binário/base64. Edição e download usam o ID WhatsApp, não o UUID interno do chat.

## Receber mensagens por webhook

O receptor roda no servidor do consumidor. Este exemplo completo usa Hono opcionalmente:

```sh
bun add hono @zappaz/zappaz-lite-sdk
```

Crie `index.ts`:

```ts
import { Hono } from 'hono'
import { Zappaz } from '@zappaz/zappaz-lite-sdk'

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`)
  return value
}

const app = new Hono()
const zappaz = new Zappaz({
  baseUrl: env('ZAPPAZ_BASE_URL'),
  apiKey: env('ZAPPAZ_API_KEY'),
  sessionId: env('ZAPPAZ_SESSION_ID'),
  webhookSecret: env('ZAPPAZ_WEBHOOK_SECRET'),
  timeoutMs: 10000,
  onWebhookError: () => {
    // Use o logger da integração, sem registrar payloads ou causas sensíveis.
    console.error('Falha ao processar webhook Zappaz')
  },
})

zappaz.onMessage('text', async (ctx) => {
  if (ctx.message.text?.trim().toLowerCase() === 'olá') {
    await ctx.reply('Olá! Como posso ajudar?')
  }
})

app.post('/webhooks/zappaz', (c) => zappaz.handleWebhook(c.req.raw))

export default { port: 3000, fetch: app.fetch }
```

Execute `bun run index.ts`. Cadastre na Zappaz uma URL pública HTTPS que aponte para `/webhooks/zappaz`, com o mesmo segredo, webhook habilitado e evento `inbound-message.upsert` selecionado. Não consuma o corpo antes de `handleWebhook`.

O receptor verifica `X-Zappaz-Webhook-Secret`, tamanho, JSON, envelope e sessão antes de executar handlers. O segredo é compartilhado, não HMAC; use HTTPS e implemente idempotência quando necessário. O SDK não oferece deduplicação, proteção contra replay ou entrega exatamente uma vez.

`onMessage` ignora mensagens próprias e eventos de saída. `ctx.reply(text)` envia na mesma conversa, inclusive em grupos, sem citar por padrão; `{ quote: true }` deve citar usando `message.messageId` (ID WhatsApp). `message.id` agora é o UUID interno e `message.conversationId` identifica a conversa persistida; ambos ficam nulos quando não houver registro. Campos como `text`, `chatId`, `message.messageId` e conteúdo citado podem estar ausentes ou nulos. O SDK deve ser atualizado para este [contrato do webhook](webhook-payloads.md); não use o UUID interno para citar no WhatsApp.

## Debounce de texto e diagnóstico

A versão 0.2.0 oferece `onTextDebounced` para acumular mensagens até uma pausa. Use-o **no lugar** do handler imediato de texto quando quiser uma única resposta por lote:

```ts
const cancelar = zappaz.onTextDebounced({ delayMs: 10000 }, async (ctx) => {
  const texto = ctx.messages.map((message) => message.text).filter(Boolean).join('\n')
  await ctx.reply(`Recebi suas mensagens:\n${texto}`)
})

// No encerramento da integração, chame cancelar().
```

O buffer é em memória e perde mensagens em reinícios; não substitui uma fila durável. O webhook confirma o recebimento antes de processar o lote; falhas posteriores vão para `onWebhookError`, sem retry automático.

Logs de payload são desativados por padrão. As opções `logWebhookPayloads` e `onWebhookPayload` podem expor mensagens e dados pessoais; habilite-as apenas com uma política adequada de proteção de dados.

## Erros e limites

- O SDK envia a chave em `x-api-key` e rejeita redirects para protegê-la.
- Não há retry automático. Após timeout, uma escrita pode já ter ocorrido; não a repita cegamente.
- Use `timeoutMs` e `signal` nas opções de chamada; respeite `Retry-After` em respostas 429.
- Erros HTTP usam `ZappazError`; falhas de rede/timeout usam `ZappazNetworkError`; respostas JSON inválidas usam `ZappazProtocolError`.
- Não registre credenciais, respostas completas de webhooks, mídias ou causas brutas. Respostas de configuração de webhook contêm segredos e headers adicionais.

## Referências

- [Pacote no npm](https://www.npmjs.com/package/@zappaz/zappaz-lite-sdk)
- [Código e guia completo](https://github.com/viiniolliveira/zappaz-lite-sdk)
- [Métodos do SDK](https://github.com/viiniolliveira/zappaz-lite-sdk/blob/main/docs/API.md)
- [Webhooks do SDK](https://github.com/viiniolliveira/zappaz-lite-sdk/blob/main/WEBHOOKS.md)
- [API de integração](api.md)
- [Payloads dos webhooks](webhook-payloads.md)
