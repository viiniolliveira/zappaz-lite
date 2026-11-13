# Payloads dos webhooks WhatsApp

Os exemplos também estão disponíveis na seção **Payloads dos webhooks** da referência interativa em `/docs` (acesso autenticado), incluindo envelopes completos de respostas a mensagens (`replyTo`), status, reações e recibos.

Os eventos de mensagens usam um contrato próprio da API, sem estruturas internas do Baileys. A implementação em `server/src/lib/whatsapp-event-normalizer.ts` é pura e independente do transporte, podendo ser reutilizada por sockets. Nenhum transporte socket novo é criado nesta alteração.

## Mensagens recebidas e enviadas

`inbound-message.upsert`, `outbound-message.upsert` e `messages.send` usam o mesmo conteúdo:

```json
{
  "event": "inbound-message.upsert",
  "payload": {
    "message": {
      "id": "00000000-0000-4000-8000-000000000001",
      "messageId": "ABC123",
      "conversationId": "00000000-0000-4000-8000-000000000002",
      "chatId": "5511999999999@s.whatsapp.net",
      "remoteJid": "5511999999999@s.whatsapp.net",
      "lid": "123456789012345@lid",
      "fromMe": false,
      "isGroup": false,
      "sender": {
        "id": "5511999999999@s.whatsapp.net",
        "name": "Maria"
      },
      "timestamp": "2026-10-30T23:20:00.000Z",
      "type": "text",
      "text": "Olá!"
    }
  },
  "session": {
    "id": "sessao-123",
    "status": "open",
    "jid": "5511888888888@s.whatsapp.net"
  }
}
```

- `timestamp`: ISO 8601 UTC, ou `null` quando indisponível/inválido.
- `id`: UUID interno da mensagem persistida; `conversationId`: UUID interno da conversa. Sempre presentes, mas `null` quando o evento não gera um registro (por exemplo, reação ou envelope de controle). Obtidos do resultado da persistência confirmada, sem consulta adicional. Não são o ID WhatsApp.
- `messageId`: ID WhatsApp da mensagem, antes exposto em `message.id`; `null` quando indisponível. O conteúdo continua normalizado, não é uma cópia do DTO REST. Os contratos de `replyTo`, atualizações, reações e recibos não mudam: seus campos `id` continuam sendo IDs WhatsApp.
- `chatId`, `sender.id`: `null` se não disponíveis. JIDs são preservados completos; `@lid` **não é um número de telefone**. Em grupos, `chatId` identifica o grupo e `sender.id` identifica o participante. Em mensagens próprias, o remetente é o JID da sessão, quando conhecido.
- `sender.name`: nome de exibição recebido, quando disponível.
- `remoteJid` e `lid`: campos sempre presentes, com posições/semântica fixas. `remoteJid` contém apenas o JID com telefone (`@s.whatsapp.net`); `lid` contém apenas o JID `@lid`. A normalização combina `key.remoteJid`/`key.remoteJidAlt` e valida `key.addressingMode` quando fornecido, sem inverter os campos conforme o modo. Remove sufixos de dispositivo nessas duas referências. `chatId` e `sender.id` mantêm os valores e o significado anteriores.
- Um identificador ausente no payload fica `null`; o webhook não consulta o banco para completar referências e nunca deduz telefone do LID. Em grupos, broadcasts e outros chats não privados, ambos ficam `null`: use `chatId` para o chat e `sender.id` para o participante. Não confundir `participantAlt` com identificador da conversa privada.
- `type`: `text`, `image`, `video`, `audio`, `document`, `sticker`, `location`, `contact`, `reaction`, `poll`, `album`, `group_invite`, `system`, `unavailable` ou `unknown`. Tipos não suportados não expõem conteúdo bruto.
- `status`: opcional, `error`, `pending`, `sent`, `delivered`, `read` ou `played`. Não é inferido quando ausente.
- `text`: texto ou legenda da mídia, quando disponível.
- `replyTo`: referência e conteúdo normalizado da mensagem citada, quando fornecido pelo Baileys. Exemplo: `{ "id": "mensagem-original", "senderId": "jid-opcional", "type": "text", "text": "Podemos marcar amanhã?" }`. Para mídia, inclui `type`, legenda em `text`, metadados em `media` e `media.thumbnail` quando houver JPEG válido; localização, contatos e reações seguem os mesmos campos da mensagem principal. Não inclui `downloadPath`, pois a mensagem citada pode não estar armazenada. A normalização é limitada a um nível, sem `replyTo` aninhado, `contextInfo` bruto, base64 do arquivo completo ou chaves de mídia. Se o conteúdo citado não vier no evento, mantém somente a referência (sem consultar o banco).
- `mentions`: lista opcional dos JIDs mencionados.
- `location`: `{ "latitude": -23.5, "longitude": -46.6, "name": "Nome opcional", "address": "Endereço opcional", "url": "www.google.com" }`. Todos os campos são opcionais. Mensagens `locationMessage` e `liveLocationMessage` preservam os dados disponíveis mesmo sem coordenadas; latitude/longitude ausentes são omitidas, nunca inferidas como `0,0`. A URL é preservada como recebida, podendo não ter protocolo; valide-a antes de criar links.

- `contacts`: lista de `{ "name": "Nome", "vcard": "vCard original", "parsed": { ... } }`. Os três campos são obrigatórios em cada contato e aceitam `null` quando ausentes ou não interpretáveis. O original é preservado e os dados extraídos são enviados junto; `parsed: null` quando não for possível interpretar o conteúdo.
- `reaction`: `{ "messageId": "mensagem-alvo", "emoji": "👍" }`. Emoji vazio significa remoção.

| Tipo normalizado | Campos próprios | Observações |
| --- | --- | --- |
| `text` | `text`, `interactive`, `selection`, `templateReply` | Os campos interativos aparecem somente quando fornecidos. |
| `image`, `video`, `audio`, `document`, `sticker` | `media`, `text` | A legenda e os metadados de mídia são opcionais. |
| `location`, `contact`, `reaction` | `location`, `contacts`, `reaction` | Cada campo corresponde ao respectivo tipo. |
| `poll` | `poll` | Pergunta, opções e votos recebidos. |
| `album`, `group_invite` | `album`, `groupInvite` | Agrupamento de mídias ou convite para grupo. |
| `system`, `unavailable`, `unknown` | `system`, `unavailable` | Avisos, conteúdo indisponível ou não reconhecido. |

Mensagens efêmeras, view-once e documentos com legenda são desembrulhados para o mesmo contrato. Nenhuma chave criptográfica, `contextInfo` bruto ou base64 do arquivo completo é incluído nesses eventos. A miniatura JPEG é a exceção: quando fornecida pelo WhatsApp e validada, aparece em `media.thumbnail` e/ou `replyTo.media.thumbnail` como `{ "mimeType": "image/jpeg", "base64": "...", "width": 80, "height": 60 }`. Prévias ausentes, inválidas ou maiores que 256 KiB são omitidas. Não há download para gerar thumbnails. Isso vale para `inbound-message.upsert`, `outbound-message.upsert` e `messages.send`, tanto nos webhooks da sessão quanto nos globais e seus logs/retries.

### Contatos compartilhados (vCard)

`contactMessage` (contato único) e `contactsArrayMessage` (lista) são normalizados como `type: "contact"` e `contacts: [...]`. Cada item mantém o `vcard` exato, sem corrigir nem substituir seu conteúdo, junto com os dados interpretados:

```json
{
  "name": "Contato de teste Zappaz",
  "vcard": "BEGIN:VCARD\nVERSION:3.0\nN:de teste Zappaz;Contato;;;\nFN:undefined\nTEL;type=CELL;type=VOICE;waid=5511999999999:+5511999999999\nEND:VCARD",
  "parsed": {
    "name": "Contato de teste Zappaz",
    "firstName": "Contato",
    "lastName": "de teste Zappaz",
    "phones": [
      { "number": "+5511999999999", "waid": "5511999999999", "types": ["CELL", "VOICE"] }
    ],
    "emails": [],
    "organization": null
  }
}
```

O nome externo prioriza `contactMessage.displayName`, depois `FN`, depois a composição de `N`. Valores vazios, `undefined` e `null` literais não são nomes válidos. No exemplo fictício recebido com `N:;Maria;;;`, `FN:Maria` e `displayName: "Maria"`, o nome é `Maria`, `firstName` é `Maria`, `lastName` é `null` e o telefone mantém a formatação `+55 11 90000-0000`.

`parsed` contém `name`, `firstName`, `lastName`, `phones`, `emails` e `organization`. Campos escalares ausentes ficam `null`; listas ficam `[]`. `number` mantém a formatação, removendo somente o prefixo `tel:` quando presente. `waid` vem exclusivamente do parâmetro do vCard, sem inferência pelo telefone. São suportados campos textuais vCard com CRLF, linhas dobradas, escapes e parâmetros `TYPE` repetidos ou separados por vírgula. Valores com `ENCODING` explícito exigem outro decodificador: o parser retorna `parsed: null`, assim como para vCards inválidos ou sem campos interpretáveis, preservando o original e o nome disponível sem interromper a mensagem.

A mesma extração se aplica a `replyTo.contacts`, `inbound-message.upsert`, `outbound-message.upsert`, `messages.send`, webhooks globais e DTOs REST/Socket.IO do chat. A normalização acontece na entrada; a leitura do DTO entrega os dados salvos, sem reprocessamento nem adaptação de formatos anteriores. Cada contato sempre inclui `name`, `vcard` e `parsed`, usando `null` quando necessário. No DTO, toda citação inclui `contacts`, com `[]` quando não houver contatos.

Os telefones do contato compartilhado não são a identidade do remetente: nunca associe esses dados ao PN/LID da conversa. Exibir ou receber o card não salva o contato na agenda.

### Localização sem coordenadas

Um local pode conter apenas nome, endereço e URL. Exemplo de webhook normalizado (sem expor o `rawContent` do WhatsApp):

```json
{
  "event": "outbound-message.upsert",
  "payload": {
    "message": {
      "id": "00000000-0000-4000-8000-000000000003",
      "messageId": "LOCATION123",
      "conversationId": "00000000-0000-4000-8000-000000000002",
      "chatId": "5511900000000@s.whatsapp.net",
      "remoteJid": "5511900000000@s.whatsapp.net",
      "lid": null,
      "fromMe": true,
      "isGroup": false,
      "sender": { "id": "5511888888888@s.whatsapp.net" },
      "timestamp": "2026-11-02T20:18:44.000Z",
      "status": "pending",
      "type": "location",
      "location": {
        "url": "www.google.com",
        "name": "Google São Paulo",
        "address": "Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil"
      }
    }
  },
  "session": { "id": "sessao-123", "status": "open", "jid": "5511888888888@s.whatsapp.net" }
}
```

`inbound-message.upsert` usa o mesmo formato de localização. Quando disponíveis, `latitude` e `longitude` também são incluídas em `location`.

### Mídia

```json
{
  "type": "audio",
  "media": {
    "mimeType": "audio/ogg; codecs=opus",
    "size": 12345,
    "duration": 12,
    "voice": true,
    "downloadPath": "/api/v1/session/sessao-123/message/ABC123/media/base64"
  }
}
```

Os campos de mídia são opcionais: `fileName`, `mimeType`, `size` (bytes), `duration` (segundos), `voice` (áudio) e `downloadPath` (quando há ID). O caminho é relativo à origem da API, não uma URL pública do WhatsApp. Faça `GET` com autenticação de sessão/usuário/admin. O caminho retorna JSON `{ "status": "success", "data": { "media": "<base64>", "mimeType": "image/jpeg", "fileName": null } }`; para bytes, use a rota `/media/binary`. Mídia sem registro retorna 404. Com persistência FlyDrive ativada, arquivo já salvo pode ser lido offline; sem arquivo salvo ou com persistência desativada, a sessão precisa estar habilitada/conectada e a mídia disponível no WhatsApp. IDs WhatsApp ambíguos na mesma sessão retornam 409. O chat usa [rota binária escopada](chat/media.md#persistência-miniaturas-e-downloads) e thumbnails, sem mudar o envelope dos webhooks.

### Templates e mensagens interativas

Respostas nativas `templateButtonReplyMessage` são normalizadas como `type: "text"`, com `selectedDisplayText` em `text` e a referência/conteúdo do template original em `replyTo`. O campo `templateReply` preserva `{ selectedId: string | null, selectedIndex: number | null }`, inclusive índice zero. Esses dados são salvos em `WaMessage.content` e enviados nos webhooks; o envelope original permanece em `rawContent`. A interface exibe texto com citação, sem outro card de botões.

Templates hidratados, `templateMessage.interactiveMessageTemplate`, `interactiveMessage` e `buttonsMessage` usam o mesmo normalizador dos eventos de mensagem e do chat. O tipo principal permanece `text`, `image`, `video` ou `document`, com texto em `text` e mídia em `media`. O cabeçalho de mídia usa o fluxo existente de download e miniatura; templates só com corpo também são reconhecidos. O campo `interactive` acrescenta título, rodapé e ações:

```json
{
  "type": "text",
  "text": "Gostaria de receber mais informações?",
  "interactive": {
    "title": "Atendimento",
    "footer": null,
    "buttons": [
      { "kind": "url", "text": "Saiba mais", "id": null, "url": "https://example.com" },
      { "kind": "reply", "text": "Sim", "id": "yes", "url": null }
    ]
  }
}
```

Links usam somente HTTP/HTTPS. Ações não suportadas ou inválidas são classificadas como `unsupported`, sem URL acionável. Mensagens do próprio WhatsApp (`0@s.whatsapp.net`), inclusive vídeos PSA, seguem esse formato. O filtro dos stubs internos é aplicado somente à persistência do chat, não suprime eventos de webhook. Formatos não reconhecidos continuam como `unknown`. No chat, o conteúdo normalizado é salvo em `WaMessage.content`, e o envelope original em `rawContent`.

#### Cobranças Pix

Botões nativos `review_and_pay` com `payment_settings[].type: "pix_dynamic_code"` e código válido acrescentam `interactive.payment`, sem gerar um botão `unsupported` para essa ação:

```json
{
  "referenceId": "Recarga",
  "currency": "BRL",
  "totalAmount": { "value": 1500, "offset": 100 },
  "items": [{ "name": "Recarga R$ 15,00", "quantity": 1 }],
  "pixCode": "codigo-pix-de-exemplo"
}
```

`referenceId` vem de `reference_id`, `totalAmount` de `total_amount` e `items` de `order.items`. O valor monetário é `value / offset`, não uma divisão fixa por 100. Valores são inteiros seguros não negativos; offset e quantidades são inteiros seguros positivos; moeda usa três letras maiúsculas. Corpo/rodapé continuam em `text`/`interactive.footer`, e outras ações são preservadas. JSON inválido, dados obrigatórios ausentes e pagamentos sem código Pix dinâmico continuam como ações `unsupported`, sem `payment`. Chave, CPF e outros detalhes do recebedor não são expostos em `payment`; o envelope original permanece em `rawContent`.

#### Listas e respostas

`listMessage` usa `type: "text"` e acrescenta `interactive.list: { buttonText, sections: [{ title, rows: [{ id, title, description }] }] }`. Títulos/descrições/IDs ausentes ficam `null` quando anuláveis; listas ausentes ficam `[]`. `buttonsResponseMessage` e `listResponseMessage` usam o texto selecionado em `text`, com `selection: { kind: "button" | "list", id: string | null }`. A citação e suas miniaturas são preservadas em `replyTo`. O chat envia opções de listas e respostas rápidas como **texto com citação**, não como seleção nativa de protocolo.

Por exemplo, o conteúdo normalizado de uma lista é:

```json
{
  "type": "text",
  "text": "Escolha um assunto:",
  "interactive": {
    "title": "Atendimento",
    "footer": null,
    "buttons": [],
    "list": {
      "buttonText": "Ver opções",
      "sections": [
        { "title": "Assuntos", "rows": [{ "id": "pedido", "title": "Pedido", "description": null }] }
      ]
    }
  }
}
```

### Enquetes, álbuns, convites e avisos

- `pollCreationMessage`, V2 e V3: `type: "poll"`, pergunta em `text`, e `poll: { name, selectableOptionsCount, options: [{ name, hash, votes }], votes: [{ voterId, fromMe, selectedOptions, timestamp }] }`. Hashes são SHA-256/base64 dos nomes das opções; seleções recebidas são hashes, não texto. Apenas o voto atual de cada autor conta; uma seleção vazia remove seu voto. O limite `0` permite múltiplas escolhas. Resultados refletem somente votos recebidos, não garantem o total do WhatsApp. Chaves de criptografia não são expostas.
- `albumMessage`: `type: "album"` e `album: { expectedImageCount, expectedVideoCount }`. É um agrupador, sem arquivo ou caminho de download. Contagens zero não comprovam um álbum vazio. As mídias são mensagens separadas.
- `groupInviteMessage`: `type: "group_invite"`, legenda em `text` e `groupInvite: { groupJid, name, expiresAt, url, thumbnail }`. O link só existe quando há código de convite válido; não é inferido do JID. A miniatura JPEG é validada. O convite em conversa individual não cria conversa de grupo.
- `DISAPPEARING_MODE`: `type: "system"`, texto legível e `system: { kind: "disappearing_mode", duration, blocked: null }`. Duração é em segundos; zero desativa. Ausência ou valor inválido resulta em `null`, não em zero.
- `BLOCK_CONTACT`: `type: "system"` e `system: { kind: "block_contact", duration: null, blocked: boolean | null }`. O aviso não executa uma ação de bloqueio no WhatsApp.
- Envelope sem mensagem/stub/localização final: `type: "unavailable"`, com `unavailable.reason: "missing_content"`. `placeholderMessage.MASK_LINKED_DEVICES` usa `reason: "linked_device"`. Não há conteúdo recuperável para inventar nesses envelopes.
- `finalLiveLocation`: `type: "location"`, coordenadas disponíveis em `location` e texto indicando encerramento; coordenadas zero são preservadas.

Reações e recibos anexados ao histórico são preservados como `reactions` e `receipts`. Timestamps de recibo zero representam ausência (`null`), nunca leitura em 1970. Tokens de compartilhamento/reporting, segredos e informações de dispositivos permanecem no envelope bruto interno, sem virar conteúdo visual ou campos públicos normalizados.

Exemplo de conteúdo de enquete antes de receber votos:

```json
{
  "type": "poll",
  "text": "Você confirma?",
  "poll": {
    "name": "Você confirma?",
    "selectableOptionsCount": 1,
    "options": [{ "name": "Sim", "hash": "kxNFXkWqIkMKkv3btw8hMS08lEq1kN+x2oRcGpa2ZP4=", "votes": 0 }],
    "votes": []
  }
}
```

## Status, reações e recibos

- `messages.update`: `payload.messages` contém `{ id, chatId, remoteJid, lid, fromMe, status?, pollVotes?, location? }`. `pollVotes` usa o mesmo formato de voto normalizado acima; `location` contém as coordenadas finais disponíveis. O chat aplica votos por autor e atualiza a localização persistida, invalidando o recurso via Socket.IO após o commit. Os campos internos de atualização do Baileys não são expostos.
- `messages.reaction`: `payload.reactions` contém `{ id, chatId, remoteJid, lid, fromMe, sender: { id, fromMe }, emoji, timestamp }`. A referência principal identifica a mensagem alvo; `sender` identifica quem reagiu. `timestamp` é ISO UTC ou `null`; emoji vazio remove a reação.
- `message-receipt.update`: `payload.receipts` contém `{ id, chatId, remoteJid, lid, fromMe, recipientId, deliveredAt, readAt, playedAt }`. Datas ausentes são `null`.

## Outros eventos

Os eventos abaixo são encaminhados com os dados recebidos do Baileys, sem o contrato normalizado de mensagens. Seus campos podem variar conforme o evento e a versão da biblioteca; não os interprete como `payload.message`.

| Eventos | Conteúdo do payload |
| --- | --- |
| `connection.update` | Atualização da conexão. |
| `chats.upsert`, `chats.update`, `chats.delete` | Dados de conversas. |
| `contacts.upsert`, `contacts.update` | Dados de contatos. |
| `groups.upsert`, `groups.update`, `group-participants.update` | Dados de grupos ou participantes. |
| `messaging-history.set` | Histórico de conversas, contatos e mensagens. |
| `messages.delete`, `messages.media-update` | Exclusões ou atualizações de mídia. |
| `call`, `presence.update`, `labels.association`, `labels.edit`, `blocklist.set`, `blocklist.update` | Dados dos respectivos eventos. |

Credenciais Baileys (`creds.update`) são exclusivamente internas: nunca são enviadas a webhooks, logs ou realtime e não podem ser reenviadas por retry.

Trate payloads e logs como potencialmente sensíveis, especialmente eventos de credenciais e conexão. Os nomes acima descrevem os encaminhamentos identificados; não presumem que todos os eventos configuráveis sejam emitidos pelo processamento atual.

## Logs, reenvios e compatibilidade

O envelope `event/payload/session`, os nomes dos eventos e os filtros por webhook não mudam. Webhooks da sessão e globais recebem o mesmo conteúdo normalizado para os eventos listados acima. Logs da sessão guardam esse conteúdo, e o retry o reenvia sem nova normalização ou download de mídia. O envelope de sessão continua refletindo o estado atual no momento do reenvio.

A inclusão de `remoteJid`/`lid` é aditiva: os consumidores atuais podem continuar usando `chatId`/`sender.id`. Exemplo equivalente em modo LID: `chatId="123456789012345@lid"`, `remoteJid="5511999999999@s.whatsapp.net"`, `lid="123456789012345@lid"`. Em modo PN, os dois últimos campos permanecem exatamente nas mesmas posições. Reenvios de logs anteriores à mudança não recebem os campos novos retroativamente.

**Mudança incompatível:** nos eventos `inbound-message.upsert`, `outbound-message.upsert` e `messages.send`, consumidores devem usar `payload.message.messageId` para o ID WhatsApp (antes `payload.message.id`). `payload.message.id` passa a ser o UUID interno, com `conversationId` para identificar a thread junto com `session.id`. Não há alias nem compatibilidade com o formato anterior. Referências aninhadas e eventos de atualização/recibo/reação preservam seus IDs WhatsApp. O conteúdo bruto permanece no armazenamento interno, sem mudar as respostas dos endpoints de envio de mensagens.

Logs antigos preservam o formato antigo no retry, incluindo a recuperação de `base64Media` quando esse campo existia. Por isso consumidores podem receber o formato anterior ao reenviar logs históricos. O evento Socket.IO `logs.entry` transmite registros de log; não é um stream de mensagens WhatsApp. Consulte [Realtime](realtime.md).
