import { normalizeVcardContact } from '../../lib/vcard.ts'
import { webhookMessage } from '../../lib/webhook-message.ts'
import type { MessageReference, NormalizedMessage } from '../../lib/whatsapp-event-normalizer.ts'

const reference: MessageReference = {
  id: 'ABC123',
  chatId: '5511999999999@s.whatsapp.net',
  remoteJid: '5511999999999@s.whatsapp.net',
  lid: '123456789012345@lid',
  fromMe: false,
}
const session = {
  id: 'sessao-123',
  status: 'open',
  jid: '5511888888888@s.whatsapp.net',
}
const timestamp = '2026-10-30T23:20:00.000Z'
const message: NormalizedMessage = {
  ...reference,
  isGroup: false,
  sender: { id: reference.remoteJid, name: 'Maria' },
  timestamp,
  type: 'text',
  text: 'Olá!',
}
const sentMessage: NormalizedMessage = {
  ...message,
  fromMe: true,
  sender: { id: session.jid },
  status: 'sent',
  text: 'Olá! Como posso ajudar?',
}
const replyMessage: NormalizedMessage = {
  ...message,
  id: 'RESPOSTA456',
  text: 'Sim, podemos marcar amanhã.',
  replyTo: {
    id: 'MENSAGEM_ORIGINAL123',
    senderId: session.jid,
    type: 'text',
    text: 'Podemos marcar amanhã?',
  },
}
const imageMessage: NormalizedMessage = {
  ...message,
  type: 'image',
  text: 'Foto do produto',
  media: {
    mimeType: 'image/jpeg',
    size: 12345,
    downloadPath: '/api/v1/session/sessao-123/message/ABC123/media/base64',
    thumbnail: {
      mimeType: 'image/jpeg',
      base64: 'BASE64_JPEG_DA_MINIATURA',
      width: 80,
      height: 60,
    },
  },
}
const locationMessage: NormalizedMessage = {
  ...reference,
  isGroup: false,
  sender: { id: session.jid },
  timestamp,
  fromMe: true,
  status: 'pending',
  type: 'location',
  location: {
    url: 'www.google.com',
    name: 'Google São Paulo',
    address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil',
  },
}
const contactMessage: NormalizedMessage = {
  ...reference,
  isGroup: false,
  sender: { id: reference.remoteJid },
  timestamp,
  type: 'contact',
  contacts: [
    normalizeVcardContact({
      displayName: 'Maria',
      vcard:
        'BEGIN:VCARD\nVERSION:3.0\nN:;Maria;;;\nFN:Maria\nTEL;type=CELL;type=VOICE;waid=5511900000000:+55 11 90000-0000\nEND:VCARD',
    }),
  ],
}
const sentContactMessage: NormalizedMessage = {
  ...contactMessage,
  fromMe: true,
  sender: { id: session.jid },
  status: 'pending',
  contacts: [
    normalizeVcardContact({
      vcard:
        'BEGIN:VCARD\nVERSION:3.0\nN:de teste Zappaz;Contato;;;\nFN:undefined\nTEL;type=CELL;type=VOICE;waid=5511999999999:+5511999999999\nEND:VCARD',
    }),
  ],
}
const interactiveMessage: NormalizedMessage = {
  ...message,
  text: 'Escolha uma opção:',
  interactive: {
    title: 'Atendimento',
    footer: null,
    buttons: [{ kind: 'reply', text: 'Falar com atendente', id: 'atendente', url: null }],
  },
}
const listMessage: NormalizedMessage = {
  ...message,
  text: 'Escolha um assunto:',
  interactive: {
    title: 'Atendimento',
    footer: null,
    buttons: [],
    list: {
      buttonText: 'Ver opções',
      sections: [
        { title: 'Assuntos', rows: [{ id: 'pedido', title: 'Pedido', description: null }] },
      ],
    },
  },
}
const pollMessage: NormalizedMessage = {
  ...message,
  type: 'poll',
  text: 'Você confirma?',
  poll: {
    name: 'Você confirma?',
    selectableOptionsCount: 1,
    options: [{ name: 'Sim', hash: 'kxNFXkWqIkMKkv3btw8hMS08lEq1kN+x2oRcGpa2ZP4=', votes: 0 }],
    votes: [],
  },
}

function example(event: string, payload: unknown): string {
  return `\`\`\`json\n${JSON.stringify({ event, payload, session }, null, 2)}\n\`\`\``
}

function messageExample(event: string, message: NormalizedMessage): string {
  return example(event, {
    message: webhookMessage(message, {
      id: '00000000-0000-4000-8000-000000000001',
      conversationId: '00000000-0000-4000-8000-000000000002',
      messageId: message.id ?? 'ABC123',
    }),
  })
}

export const webhookPayloadsDocumentation = [
  '# Payloads dos webhooks',
  'Exemplos do JSON enviado por POST à URL configurada no webhook. São notificações enviadas pelo Zappaz, não bodies para cadastrar um webhook nem endpoints a serem chamados na API.',
  '## Estrutura e identificadores',
  '- `event`: nome do evento selecionado na configuração do webhook.\n- `payload`: conteúdo específico do evento.\n- `session`: identificação e estado da sessão WhatsApp que originou o evento.',
  '`remoteJid` e `lid` estão sempre presentes nas referências de mensagens normalizadas: `remoteJid` é o JID com telefone (`@s.whatsapp.net`); `lid` é o identificador `@lid`. Um identificador indisponível é `null`. Nunca deduza telefone a partir de LID. Esses campos não trocam de posição conforme o modo de endereçamento recebido do WhatsApp.',
  '`chatId` identifica o chat WhatsApp e `sender.id` identifica o remetente. Ambos preservam a semântica do WhatsApp e podem conter um LID. Em grupos, `chatId` identifica o grupo, `sender.id` identifica o participante e `remoteJid`/`lid` ficam `null`. Nos eventos inbound-message.upsert, outbound-message.upsert e messages.send, `message.id` é o UUID interno da mensagem, `message.messageId` é o ID WhatsApp e `message.conversationId` é o UUID da conversa. Os UUIDs são obtidos após persistência e ficam null quando o evento não cria um registro (por exemplo, reações e envelopes de controle). O conteúdo continua normalizado, não é o DTO REST completo. Referências em replyTo, atualizações, reações e recibos preservam seus IDs WhatsApp.',
  '## Mensagem recebida',
  '`inbound-message.upsert` entrega a mensagem normalizada em `payload.message`.',
  messageExample('inbound-message.upsert', message),
  '## Mensagem enviada',
  '`outbound-message.upsert` e `messages.send` usam o mesmo formato de `payload.message`. `fromMe: true` indica mensagem própria; quando conhecido, `sender.id` é o JID da sessão. O exemplo mostra `outbound-message.upsert`; em `messages.send`, o nome do evento é `messages.send`.',
  messageExample('outbound-message.upsert', sentMessage),
  '## Resposta a uma mensagem (reply)',
  'Uma resposta mantém o evento e o formato normal da mensagem; a citação aparece em `payload.message.replyTo`. Neste exemplo, Maria responde a uma mensagem enviada anteriormente pela sessão.',
  messageExample('inbound-message.upsert', replyMessage),
  '`message.messageId` identifica a nova resposta (`RESPOSTA456`) no WhatsApp; `replyTo.id` identifica a mensagem original citada (`MENSAGEM_ORIGINAL123`) no WhatsApp. `message.id` é o UUID interno da nova resposta. `replyTo.senderId`, quando disponível, identifica quem enviou a mensagem citada; `message.sender.id` continua identificando quem está respondendo.',
  '`replyTo.type` e `replyTo.text` contêm o tipo e o texto normalizados da mensagem citada. Para mídia, `replyTo` pode incluir `media`, legenda em `text` e `media.thumbnail`; não inclui `downloadPath` nem outro `replyTo` aninhado. Se o WhatsApp não fornecer o conteúdo citado, o webhook mantém somente a referência disponível, sem consultar o banco. Quando não há citação, `replyTo` é omitido.',
  '## Mensagem interativa',
  'Botões e listas preservam `type`, `text` e, quando aplicável, `media`. O campo `interactive` contém título, rodapé e botões; listas também podem incluir `interactive.list`. Respostas nativas podem incluir `selection` ou `templateReply`, além de `replyTo` quando houver citação.',
  messageExample('inbound-message.upsert', interactiveMessage),
  'Uma lista usa o mesmo envelope; suas seções e opções aparecem em `interactive.list`.',
  messageExample('inbound-message.upsert', listMessage),
  '## Enquete',
  '`poll.options[].hash` é o SHA-256/base64 do nome da opção. Os resultados refletem apenas os votos recebidos. `messages.update` pode incluir `pollVotes` com votos normalizados; uma seleção vazia remove o voto.',
  messageExample('inbound-message.upsert', pollMessage),
  '## Mídias e miniaturas',
  'Imagens, vídeos, áudios, documentos e stickers usam `message.media`. `message.text` contém a legenda, quando disponível. Os campos `mimeType`, `fileName`, `size` (bytes), `duration` (segundos), `voice`, `downloadPath` e `thumbnail` são opcionais conforme o conteúdo recebido.',
  messageExample('inbound-message.upsert', imageMessage),
  '`BASE64_JPEG_DA_MINIATURA` é apenas um placeholder: eventos reais contêm o base64 do JPEG validado, quando fornecido pelo WhatsApp. Miniaturas ausentes, inválidas ou maiores que 256 KiB são omitidas. O webhook não inclui base64 do arquivo completo nem chaves de mídia.',
  '`downloadPath` é relativo à origem da API. Faça GET com API Key global/restrita autorizada ou cookie de login. A rota retorna JSON `{ "status": "success", "data": { "media": "<base64>", "mimeType": "image/jpeg", "fileName": null } }`. Para binário, use a rota `/media/binary`. Sem arquivo persistido, a sessão deve estar habilitada/conectada e a mídia ainda disponível no WhatsApp. IDs WhatsApp ambíguos na mesma sessão retornam 409.',
  '## Localização (location message)',
  'Mensagens `locationMessage` e `liveLocationMessage` do WhatsApp são normalizadas com `type: "location"`. `location.latitude`, `location.longitude`, `location.name`, `location.address` e `location.url` são opcionais: os dados disponíveis são preservados mesmo sem coordenadas. Coordenadas ausentes são omitidas no webhook, nunca substituídas por `0,0`. A URL é mantida como recebida e pode não ter protocolo; valide-a antes de criar links.',
  messageExample('outbound-message.upsert', locationMessage),
  'O exemplo representa um local compartilhado apenas com nome, endereço e URL. Quando fornecidas pelo WhatsApp, as coordenadas aparecem no mesmo objeto, por exemplo `"latitude": -23.5505, "longitude": -46.6333`. O evento de recebimento `inbound-message.upsert` usa o mesmo formato de localização.',
  '## Contatos compartilhados (vCard)',
  '`contactMessage` e `contactsArrayMessage` usam `type: "contact"` e a mesma lista `contacts`. Cada item sempre contém `name`, `vcard` e `parsed`. O `vcard` é preservado exatamente como recebido; `parsed` contém `name`, `firstName`, `lastName`, `phones`, `emails` e `organization`. Cada telefone contém `number` (formatação original, removendo apenas o prefixo `tel:` quando houver), `waid` (somente se fornecido no vCard) e `types`. Campos escalares ausentes são `null`; listas ausentes são `[]`.',
  messageExample('inbound-message.upsert', contactMessage),
  'O nome externo `name` prioriza `contactMessage.displayName`, depois `FN`, depois o nome composto a partir de `N`. Valores vazios, `undefined` e `null` literais são ignorados nessa seleção, mas o vCard original nunca é corrigido ou substituído. O exemplo abaixo mantém `FN:undefined` e extrai o nome válido de `N`.',
  messageExample('outbound-message.upsert', sentContactMessage),
  '`parsed: null` indica ausência de dados interpretáveis, vCard inválido ou codificação não suportada. O original e o nome disponível continuam no payload, sem impedir o processamento. São suportados campos textuais vCard com linhas dobradas, CRLF, escapes, telefones múltiplos e parâmetros `TYPE` repetidos. Valores com `ENCODING` explícito não são decodificados por este parser. A mesma extração se aplica a `replyTo.contacts`, `messages.send`, webhooks globais e aos DTOs REST/Socket.IO do chat. A extração ocorre somente na entrada; a leitura dos DTOs entrega os dados normalizados salvos, sem adaptação de formatos anteriores.',
  'O telefone do contato compartilhado não identifica o remetente: nunca associe `contacts[].parsed.phones` ao PN/LID da conversa. Receber ou exibir o card não salva o contato na agenda.',
  '## Atualização de status',
  '`messages.update` entrega uma lista em `payload.messages`. `status`, quando presente, pode ser `error`, `pending`, `sent`, `delivered`, `read` ou `played`; não é inferido quando ausente.',
  example('messages.update', {
    messages: [{ ...reference, fromMe: true, status: 'read' }],
  }),
  '## Reações',
  '`messages.reaction` entrega uma lista em `payload.reactions`. A referência principal identifica a mensagem alvo; `sender` identifica quem reagiu. `emoji: ""` indica remoção da reação.',
  example('messages.reaction', {
    reactions: [
      {
        ...reference,
        fromMe: true,
        sender: { id: reference.remoteJid, fromMe: false },
        emoji: '👍',
        timestamp,
      },
    ],
  }),
  '## Recibos de entrega, leitura e reprodução',
  '`message-receipt.update` entrega uma lista em `payload.receipts`. `recipientId` identifica o destinatário; `deliveredAt`, `readAt` e `playedAt` são datas ISO 8601 UTC ou `null` quando indisponíveis.',
  example('message-receipt.update', {
    receipts: [
      {
        ...reference,
        fromMe: true,
        recipientId: reference.remoteJid,
        deliveredAt: timestamp,
        readAt: '2026-10-30T23:21:00.000Z',
        playedAt: null,
      },
    ],
  }),
  '## Outros tipos de mensagem',
  '- `album`: `album` contém as contagens esperadas; as mídias são mensagens separadas.\n- `group_invite`: `groupInvite` contém o convite; o link depende de código válido e não cria conversa de grupo.\n- `system`: `system` descreve avisos de mensagens temporárias ou bloqueio; duração em segundos.\n- `unavailable`: `unavailable.reason` indica conteúdo ausente ou oculto pelo dispositivo vinculado.\n- `unknown`: conteúdo não reconhecido; o envelope bruto permanece interno.',
  '## Outros eventos',
  '- `connection.update`: atualização de conexão.\n- `chats.upsert`, `chats.update` e `chats.delete`: dados de conversas.\n- `contacts.upsert` e `contacts.update`: dados de contatos.\n- `groups.upsert`, `groups.update` e `group-participants.update`: dados de grupos ou participantes.\n- `messaging-history.set`: histórico; não usa `payload.message` normalizado.\n- `messages.delete` e `messages.media-update`: exclusão ou atualização de mídia.\n- `call`, `presence.update`, `labels.association`, `labels.edit`, `blocklist.set` e `blocklist.update`: dados dos respectivos eventos.',
  'Esses eventos são encaminhados sem o contrato normalizado de mensagens; seus campos variam conforme o WhatsApp e o Baileys. Credenciais Baileys são exclusivamente internas e nunca são encaminhadas.',
  '## Campos opcionais e reenvios',
  '`timestamp` é ISO 8601 UTC ou `null` quando ausente/inválido. `id`, `chatId` e `sender.id` também podem ser `null`. Campos adicionais de mensagem incluem `mentions`, `replyTo`, `location`, `contacts` e `reaction`, conforme o tipo. `replyTo` pode incluir o conteúdo normalizado da mensagem citada e sua miniatura, mas não contém `downloadPath` nem outro `replyTo` aninhado.',
  'O envelope `event/payload/session` é compartilhado por webhooks da sessão e globais. O retry reenvia o conteúdo salvo no log sem normalizá-lo novamente; `session` reflete o estado atual no momento do reenvio. Logs antigos podem preservar o formato legado. O evento Socket.IO `logs.entry` transmite registros de entrega, não estes eventos diretamente.',
  'Os exemplos acima cobrem os eventos de mensagens normalizados. Eventos de conexão, grupos, contatos e histórico possuem contratos específicos e não devem ser interpretados como `payload.message`.',
].join('\n\n')
