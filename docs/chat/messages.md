# Mensagens do chat

[← Chat](README.md)

## Histórico e paginação

`GET /api/v1/session/:sessionId/conversations/:conversationId/messages` aceita `limit` (1–100, default 50) e **`before` ou `after`, nunca ambos**:

1. Sem cursor, retorna as últimas mensagens em ordem cronológica.
2. Para anteriores, envie `before=boundaries.first` ou `page.nextCursor` da paginação para trás.
3. Para posteriores, envie `after=boundaries.last`; continue com `page.nextCursor` enquanto `hasMore=true` nessa direção.

```json
{"status":"success","data":[],"page":{"nextCursor":null,"hasMore":false},"boundaries":{"first":null,"last":null}}
```

Cursores são opacos e assinados; preserve sessão/conversa, direção e filtros, codifique na URL e não os fabrique. O exemplo vazio mostra somente o envelope; schemas executáveis ficam em `server/src/lib/chat-contract.ts`.

## Conteúdo normalizado

O DTO aceita `poll`, `album`, `group_invite`, `system` e `unavailable` e sempre inclui os campos anuláveis `poll`, `album`, `groupInvite`, `system`, `unavailable`, `selection` e `interactive`. Formatos seguem a [normalização compartilhada com webhooks](../webhook-payloads.md#enquetes-álbuns-convites-e-avisos). O servidor entrega dados normalizados na entrada, sem renormalizar `rawContent`, suportar DTOs antigos ou converter mensagens antigas `unknown`.

Templates hidratados e interativos preservam texto, título, rodapé e botões em `interactive`. O tipo principal continua `text`, `image`, `video` ou `document`. Cabeçalhos de vídeo com `staticUrl` usam download e descriptografia Baileys. A interface reutiliza cards de texto/mídia; URLs abrem somente HTTP/HTTPS. Respostas rápidas enviam texto com citação pelo fluxo normal, não payload nativo de seleção. Ações sem suporte ficam desabilitadas.

Cobranças nativas `review_and_pay` com `pix_dynamic_code` usam `interactive.payment` ([contrato](../webhook-payloads.md#cobranças-pix)). O card mostra número da cobrança, itens/quantidades, método Pix, total calculado por `value / offset`, corpo, rodapé e horário/status. “Copiar código Pix” copia o código completo e informa sucesso ou falha; não inicia pagamentos nem exibe chave/CPF. Dados inválidos e outros métodos de pagamento continuam como ações não suportadas. O suporte vale para mensagens normalizadas na entrada, sem reprocessar o histórico existente.

Listas usam `interactive.list`. Respostas nativas de botão (`templateButtonReplyMessage`) são texto com citação; `content.templateReply` preserva ID/índice da opção e miniaturas do template citado quando disponíveis. O normalizador também reconhece `templateMessage.interactiveMessageTemplate`, botões/listas clássicos e respostas, enquetes V1/V2/V3, álbuns, convites e localização final. Dados estruturados ficam em `WaMessage.content`.

Votos em `messages.update` substituem o voto do autor, respeitando timestamp/remoção e invalidando após persistir. Reações de histórico mantêm versões para não serem sobrescritas por eventos anteriores. Segredos, recibos por dispositivo e tokens técnicos não viram conteúdo visual.

Contatos compartilhados sempre incluem `name`, `vcard` e `parsed`; ausentes/não interpretáveis são `null`. `parsed` contém nome, sobrenome, telefones (`number`, `waid`, `types`), emails e organização. Extração ocorre só na entrada, igual para mensagens únicas, listas e `replyTo.contacts`; citações incluem `contacts: []` quando não há contatos. `parsed:null` indica ausência de dados interpretáveis, conteúdo inválido ou codificação não suportada; o original é preservado. A interface não salva automaticamente na [agenda](contacts.md) nem associa o remetente pelos telefones do vCard.

Citações de imagem/vídeo podem incluir `replyTo.media.thumbnail` (JPEG base64 validado) e `replyTo.fromMe` anulável. A interface mostra a prévia sem baixar o arquivo; pode reutilizar miniatura da mensagem original quando carregada no histórico.

## Avisos internos e apresentação

Stubs `E2E_ENCRYPTED`, `E2E_ENCRYPTED_NOW`, `BIZ_COEX_PRIVACY_TRANSITION`, `BIZ_PRIVACY_MODE_INIT_FB`, `BIZ_COEX_PRIVACY_INIT`, `CHAT_PSA`, `BIZ_PRIVACY_MODE_TO_FB`, `BIZ_BOT_1P_MESSAGING_ENABLED` e `BIZ_CUSTOMER_3PD_DATA_SHARING_OPT_OUT_MESSAGE` são ignorados na ingestão ao vivo e histórica, antes de criar contatos/conversas/mensagens. O último é o aviso de compartilhamento de dados desativado em conversas comerciais originadas de anúncios da Meta. Usa-se as constantes Baileys. Isso não impede resumos de histórico de criarem conversas nem limpa registros existentes.

`REVOKE` remove logicamente a mensagem indicada por `messageStubParameters[0]` ou pela própria chave, sem criar mensagem/conversa. `DISAPPEARING_MODE` e `BLOCK_CONTACT` são avisos `system`; mensagens sem conteúdo e placeholders `MASK_LINKED_DEVICES` são `unavailable`. Outros `unknown` preservam `rawContent` para investigação. Conteúdo de `0@s.whatsapp.net` é mantido; apenas o stub `CHAT_PSA` é ignorado.

O stub numérico `224` ainda não é identificado no enum da Baileys usado pelo projeto: permanece `unknown`, com `rawContent` preservado, sem ser descartado ou interpretado como exclusão. O filtro do chat não suprime eventos de webhook.

Envelopes `protocolMessage` não viram mensagens. Edições/exclusões com alvo atualizam o registro; outros controles, inclusive `EPHEMERAL_SYNC_RESPONSE`, são ignorados no chat, não incrementam não lidas nem alteram última mensagem. O fluxo de webhooks é independente. Não há migração/limpeza automática de registros antigos.

O chat exibe templates, listas expansíveis, enquetes com resultados recebidos/escolha própria, convites e avisos. Não permite votar nem entrar automaticamente em grupos; enquetes orientam usar WhatsApp e convites só oferecem link válido e não expirado. Agrupadores `album` ficam ocultos, sem balão ou separador de dia próprio; fotos/vídeos continuam visíveis.

Localizações preservam nome, endereço e URL sem coordenadas. No DTO, `latitude`/`longitude` ausentes são `null` (no webhook são omitidas). O card usa miniatura JPEG validada e abre Google Maps por coordenadas ou busca de nome/endereço; sem esses dados aceita somente URL HTTP(S) válida, caso contrário não gera link. Não usa embed, chave de API ou imagens remotas. Localização ao vivo mostra o ponto recebido, sem acompanhamento contínuo.

Links com metadados recebidos do WhatsApp exibem título, descrição de até três linhas, domínio e miniatura JPEG validada. Texto original fica abaixo, com largura adaptada ao celular e horário no rodapé. Sem metadados, só texto. Não há busca externa para gerar preview; YouTube mantém o player existente sem duplicar card. Links abrem com `noopener noreferrer`.

## Formatação do WhatsApp

Mensagens recebidas, enviadas e legendas interpretam `*negrito*`, `_itálico_`, `~tachado~`, código entre crases e monoespaçado entre três crases. Estilos diferentes podem ser combinados; código mantém marcadores e URLs literais. Citações também mostram a formatação, mas sem links interativos dentro do botão de navegação.

URLs HTTP/HTTPS válidas e sem credenciais ficam clicáveis, com `noopener noreferrer`. Pontuação ao redor não faz parte do destino; parênteses balanceados da própria URL são preservados. Quebras de linha e espaços são mantidos. Marcadores sem fechamento, no meio de palavras e a sintaxe Markdown de marcadores duplos permanecem literais. Títulos, tabelas e HTML não são interpretados.

A apresentação usa nós React, sem injetar HTML ou alterar o texto armazenado, enviado ou copiado. Assinaturas como `*Lucas - Financeiro:*` são exibidas em negrito. Cards de links e YouTube permanecem disponíveis, exceto para URLs dentro de código.

Cards de prévia de link usam largura entre 16 e 22 rem quando há espaço; em painéis e telas menores, encolhem para caber no balão. Títulos, descrições, URLs e o texto da mensagem quebram dentro dessa largura sem alargá-la. Links textuais sem card e cards do YouTube mantêm sua apresentação própria.

### Identificação persistida de links

`WaMessage.hasLink` é um booleano obrigatório no banco e no DTO, com padrão `false` no banco. Ao persistir mensagens recebidas, enviadas ou sincronizadas, o valor considera uma prévia de link válida ou URLs HTTP/HTTPS no texto/legenda. Edições recalculam o valor; exclusões o limpam; recibos, mudanças de status e duplicatas não reclassificam o conteúdo.

A detecção compartilha o parser puro de `shared/whatsapp-format.ts` com a interface: reconhece links dentro de estilos, preserva parênteses balanceados e não considera URLs dentro de código nem destinos com credenciais. Não consulta sites para classificar uma mensagem. Uma mensagem com vários links corresponde a um único item na biblioteca; uma mídia com link na legenda pode aparecer nas abas Mídia e Links.

Não existe detecção ou adaptação retroativa durante a leitura.

## Envio e compositor

Enter envia; Shift + Enter insere linha. Rascunhos ficam em memória por sessão/conversa e sobrevivem a falhas. O compositor usa superfície única, texto acima e ações abaixo; não mostra dica fixa do atalho. O rodapé aparece apenas para envio indisponível ou contador próximo do limite.

A superfície flutuante acompanha o raio (`--radius`) e a cor de borda (`--input`) do tema selecionado. O textarea interno permanece sem borda para evitar contorno duplo.

Texto do chat tem body de até 32 KiB e 1–4096 caracteres não brancos. Envio retorna HTTP 201 com `{status:'success',data:MessageDTO}`. `clientRequestId` correlaciona envio otimista; timeout/5xx nunca repetem POST automaticamente. Uploads e gravação estão em [mídias](media.md).

## Assinatura

Em Configurações da sessão, defina o nome e ative “Assinar mensagens”. O compositor oferece o toggle “Assinar mensagem”, que reflete e salva `config.signatureEnabled` na sessão, valendo também para outras conversas e envios que herdam esse padrão. Configure o nome na sessão antes de ativar pelo chat. Durante a atualização, o envio de texto fica bloqueado até a configuração ser recarregada; erros preservam o valor salvo e são informados por toast.

O backend adiciona `*Nome da assinatura:*`, incluindo os dois-pontos automaticamente, seguido de uma quebra de linha antes do texto, sem modificar o rascunho. Funciona também com mensagens rápidas e respostas citadas enviadas como texto. Áudios, mídias e legendas não recebem assinatura.

O endpoint de texto da conversa aceita `signMessage?: boolean` e `signatureName?: string`, além de `text`, `clientRequestId` e da citação opcional. Sobrescritas valem apenas naquele envio e seguem as [regras compartilhadas da assinatura](../api.md#assinatura-de-mensagens-de-texto).

## Mensagens rápidas

O catálogo é individual por sessão WhatsApp, como as etiquetas, e fica em `WaQuickMessage`. Não pertence ao usuário nem à conversa. Excluir a sessão remove seu catálogo por cascade; excluir um atalho não altera rascunhos ou mensagens já enviadas.

Campos obrigatórios: `name` (nome amigável, até 60 caracteres), `command` (até 40 caracteres, sem `/`, letras ASCII, números, hífen ou sublinhado; primeiro caractere alfanumérico) e `message` (1–4096 caracteres, não apenas espaços). Nome/comando recebem trim; comando é normalizado para minúsculas e único dentro da sessão. A mensagem preserva espaços e quebras de linha. Sessões diferentes podem repetir comandos.

| Método | Rota | Resposta |
| --- | --- | --- |
| GET | `/api/v1/session/:sessionId/quick-messages` | 200, `{status:'success',data:[...]}`, lista completa ordenada por nome e ID |
| POST | `/api/v1/session/:sessionId/quick-messages` | 201, registro criado |
| PATCH | `/api/v1/session/:sessionId/quick-messages/:quickMessageId` | 200, registro atualizado; envie os três campos |
| DELETE | `/api/v1/session/:sessionId/quick-messages/:quickMessageId` | 200, `{status:'success',data:{quickMessageId}}` |

POST/PATCH recebem, por exemplo, `{"name":"Boas-vindas","command":"ola","message":"Olá! Como podemos ajudar?"}`. O registro retornado em `data` inclui `id` (UUID), `sessionId`, os três campos e datas ISO `createdAt`/`updatedAt`. Acesso segue as etiquetas: proprietário/admin via cookie ou API Key global/restrita autorizada; não exige WhatsApp conectado ou sessão habilitada. Entrada inválida retorna 400, comando duplicado 409 e ID inexistente/pertencente a outra sessão 404.

No compositor, digitar `/` no início de um campo vazio abre o menu Command do shadcn acima do input. `/atalho` filtra imediatamente por nome/comando, ignorando caixa e acentos. O menu exibe comando, nome e prévia; setas navegam, Enter insere o texto **sem enviar**, Esc fecha e Shift+Enter mantém a quebra de linha. Sem resultados, Enter não envia o comando. URLs e textos comuns não abrem o menu. O foco permanece no compositor, e a inserção substitui o comando pelo conteúdo integral, preservando citações e o fluxo normal de envio.

O botão “Mensagens rápidas”, junto de anexos e áudio, abre o gerenciamento com busca, criação, edição e exclusão confirmada. Ao trocar de sessão, o modal fecha e as sugestões passam a usar o catálogo da nova sessão. Átomos em `src/atoms/quick-messages.ts` usam services HTTP e cache separado por sessão. Alterações confirmadas publicam `app.invalidate` com `resource:'quick-messages'`, atualizando somente esse catálogo nas outras abas autorizadas; mutations também invalidam o cache local.

## Ações e exclusão no WhatsApp

Mensagens confirmadas e não removidas têm seta de ações no canto superior direito, visível em hover/foco e sempre disponível em toque. Permite responder citando, copiar texto/legenda e, para mensagens próprias, “Apagar para todos” com confirmação.

A citação aparece acima do compositor, pode ser cancelada e acompanha texto, anexos e áudio; é isolada por sessão/conversa e preservada em falhas.

`DELETE /api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId` solicita revogação ao WhatsApp para mensagem própria em conversa individual da sessão. Exige WhatsApp habilitado/conectado. Retorna `{status:'success',data:MessageDTO}` removido; só altera o registro após aceite do WhatsApp, com feedback em falhas. Não equivale à [exclusão local da conversa](conversations.md#exclusão-definitiva-local). `messageRecordId` é o UUID interno, não o ID WhatsApp `messageId`.

## Edição de texto

`PATCH /api/v1/session/:sessionId/conversations/:conversationId/messages/:messageRecordId` recebe `{"text":"Texto atualizado"}`. Usa o UUID interno, limitado à sessão/conversa, e retorna HTTP 200 com `{status:"success",data:MessageDTO}`. A [API de integração](../api.md#editar-mensagem-de-texto) também oferece edição pelo ID WhatsApp, com as mesmas regras.

Somente mensagens próprias de texto, inclusive respostas de texto, podem ser editadas. Citação, identidade, horário, status e reações são preservados; `editedAt`, conteúdo, links e revisão são atualizados no registro original. Não cria outro balão, não reaplica assinatura e não altera mensagens recebidas, removidas, mídias/legendas ou templates interativos. O novo texto tem 1–65.536 caracteres, não apenas espaços. A sessão deve estar habilitada/conectada; restrições de edição do WhatsApp continuam aplicáveis.

O menu oferece **Editar mensagem** para textos próprios confirmados. O modal mostra a mensagem original (incluindo citação), input preenchido e confirmação; Enter salva, Shift+Enter quebra linha. Texto vazio ou inalterado não pode ser confirmado. Durante o envio, impede novo submit e fechamento; falhas preservam o rascunho. Sucesso atualiza o balão com “Editada”, sincroniza outras abas via Socket.IO e não solicita rolagem ao fim. Uma remoção recebida durante a edição bloqueia o salvamento.

Há uma única instância do modal no nível do chat. Os menus apenas selecionam a mensagem em `chatEditMessageAtom`; nenhum balão controla ou monta seu próprio modal de edição. Fechar o modal, trocar de conversa/sessão ou sair do chat limpa a seleção e descarta o rascunho de edição.

## Rolagem

Abrir conversa ou concluir envio de texto, áudio ou anexo leva à última mensagem, mesmo após leitura de mensagens anteriores. Conclusão de envio em outra sessão/conversa não desloca a atual.

ResizeObserver acompanha alturas (incluindo mídias e retorno dos anexos) enquanto a pessoa está no fim. Subir interrompe acompanhamento para recebidas/atualizações; paginação preserva posição, exceto quando novo envio solicita o fim. O histórico registra a posição automática: scroll atrasado nessa posição não desativa acompanhamento quando imagens aumentam o conteúdo, só mudança efetiva de posição.

Rolagem não marca leitura; veja [leitura local](conversations.md#leitura-local).
