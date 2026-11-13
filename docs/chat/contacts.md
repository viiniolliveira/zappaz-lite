# Contatos do chat

[← Chat](README.md)

## Agenda e identidade

A agenda é local e pertence à sessão, separada das [conversas](conversations.md). Receber mensagens ou sincronizar contatos cria somente identidades internas (`isSaved: false`); salvar na agenda exige ação explícita. Nenhum CRUD de contato modifica a agenda ou o chat do WhatsApp.

`ContactDTO` inclui `isSaved: boolean`, `localName: string | null`, `email: string | null`, `annotations: string | null` e `lid: string | null`, separado de `phoneNumber`. `displayName` prioriza `localName`, seguido de nome/pushName do WhatsApp, telefone e JID. A sincronização não altera os campos locais.

PN e LID explicitamente associados no payload resolvem o mesmo contato e conversa dentro da sessão, mantendo UUIDs e identificadores conhecidos quando ausentes em eventos parciais. Não se infere telefone de um LID nem se associa por nome. Associações contraditórias ou históricos separados geram `CONTACT_IDENTITY_CONFLICT`; veja [diagnóstico do sync](realtime.md#diagnóstico-de-falhas-no-sync).

## Fotos de perfil

`avatarUrl` é uma URL externa do WhatsApp; não são criados arquivos locais. `WaContact.avatarCheckedAt` guarda a última consulta bem-sucedida, inclusive quando não há foto, e é retornado como ISO string ou `null` no contato aninhado do GET de conversas e nos demais ContactDTOs. O cache dura uma hora e não usa `updatedAt`, pois outras alterações do contato não devem renovar esse prazo.

O card usa IntersectionObserver: somente ao entrar na área visível da lista a interface verifica a data recebida, sem chamar o backend para verificar validade. Data vazia ou com uma hora ou mais autoriza `POST /api/v1/session/:sessionId/contacts/:contactId/avatar`, sem corpo. O backend exige acesso à sessão e um contato vinculado a conversa privada com mensagens, confirma a validade do cache e deduplica consultas simultâneas por sessão/contato no processo. Retorna `{status:'success',data:ContactDTO}`; o resultado atualiza o cache local e o Socket.IO propaga o contato/revisão após o commit. URL igual também renova a data; ausência de foto ou erro 404 do WhatsApp salva `null` com a data, impedindo repetição por uma hora.

Erros temporários retornam 503 `PROFILE_PICTURE_UNAVAILABLE` sem apagar URL nem alterar `avatarCheckedAt`. A interface preserva foto/iniciais, não faz retry automático em loop e permite nova tentativa quando o card voltar a entrar em tela. Sessão desconectada/desabilitada retorna 409 para cache vencido; cache fresco pode ser servido sem WhatsApp conectado. Contatos de outra sessão ou sem conversa privada com mensagens retornam 404. Não há polling nem varredura geral de contatos ao conectar, receber sync/eventos de contatos ou no agendamento horário. O sinal `imgUrl: "changed"` não dispara consulta; `"removed"` continua removendo a URL fornecida pelo sync. As identidades internas sem mensagens permanecem salvas, mas não geram consultas de fotos nem viram entradas da agenda.

Regressão: `bun --no-env-file test ./test/chat/avatar-browser.test.ts ./test/chat/avatar-service.test.ts ./test/chat/avatar-route.test.ts ./test/sessions/profile-pictures.test.ts`. Os testes isolam autenticação, persistência e respostas do WhatsApp; o teste de navegador usa React em Chrome headless e um IntersectionObserver simulado. Cobrem visibilidade, validade do cache, ausência de foto, erro, deduplicação, escopo e publicação após transação.

Validação da implementação: 64 testes relevantes passaram, incluindo os novos cenários de avatar, contratos, sessões, autorização, realtime, migrations e documentação; build, lint, check do backend e Biome dos arquivos novos passaram. A suíte completa terminou com 716 aprovados, 25 ignorados e 8 falhas nos grupos já conhecidos (lista de conversas, rolagem, frontend realtime, layout do compositor, áudio, conflito de histórico e fixture de webhooks globais). Não houve validação com WhatsApp real nesta etapa.

## Endpoints

Base: `/api/v1/session/:sessionId`.

| Método e rota | Contrato |
| --- | --- |
| `GET /contacts` | Lista apenas contatos salvos, com busca `q` e paginação por cursor. Nome local participa da busca e ordenação. |
| `POST /contacts` | `{name,phoneNumber,email?,annotations?}`; cria contato (201), reutilizando identidade e conversa existentes, sem criar conversa nem enviar mensagem. Telefone já salvo na sessão retorna 409. |
| `PUT /contacts/:contactId` | `{name,email?,annotations?}`; salva uma identidade interna na agenda, inclusive quando só há LID. |
| `PATCH /contacts/:contactId` | `{name,email?,annotations?}`; edita dados locais de um contato salvo. Telefone não é editável, pois identifica o histórico. |
| `DELETE /contacts/:contactId` | Define `isSaved: false` e limpa `localName`, `email` e `annotations`; preserva identidade, conversa, mensagens e mídias. |

Nome é obrigatório, com até 200 caracteres. Email é opcional, válido e limitado a 254 caracteres; anotações são opcionais, até 5.000 caracteres. Valores são aparados; `""` ou `null` limpam campos opcionais, e omitir um campo no PATCH preserva seu valor. Telefone deve incluir país e DDD; espaços, `+`, parênteses e hífens são removidos.

Mutations retornam `{status:'success',data:ContactDTO}`. Novas mensagens não fazem um contato removido reaparecer na agenda. Excluir uma conversa também preserva a agenda.

## Paginação

`limit` aceita 1–100 (default 50), `q` até 200 caracteres. Exemplo:

```text
GET /api/v1/session/ID_DA_SESSAO/contacts?limit=50&q=Maria
GET /api/v1/session/ID_DA_SESSAO/contacts?limit=50&q=Maria&cursor=CURSOR_CODIFICADO
```

```json
{"status":"success","data":[],"page":{"nextCursor":null,"hasMore":false}}
```

Enquanto `hasMore=true`, envie `nextCursor`, preservando filtros e sessão. Cursores são opacos e assinados: não use IDs, não os fabrique nem reutilize entre escopos. Codifique o cursor na URL.

As buscas de contatos e conversas mantêm digitação imediata, mas aplicam filtro local e consulta após 500 ms sem alterações. O hook `src/hooks/use-debounce.ts` cancela o timer ao desmontar; a sincronização dos filtros reinicia por sessão. O multiselect reutiliza esse hook.

## Interface

A lista lateral não usa abas. “Nova conversa” abre a agenda; “Voltar para conversas” retorna à lista e devolve o foco ao botão. O seletor de sessão permanece nas duas telas; buscas e filtro de não lidas são preservados ao alternar. Abrir um contato seleciona sua conversa e retorna à lista.

Clicar no avatar ou nome do cabeçalho abre `contact-details-panel.tsx`, com foto, nome, telefone, email e anotações locais. Em telas amplas, aparece à direita; em telas menores ocupa a área da conversa sem desmontar o histórico. O lápis abre `contact-form.tsx` no próprio painel; voltar/cancelar ou salvar retorna às informações. Os formulários usam o mesmo `PhoneInput` de `/account`.

Identidades não salvas oferecem “Salvar contato”, inclusive quando só há LID. Menus da lista de contatos mantêm exclusão, mas não edição. As ações de editar/salvar na lista de conversas também abrem o painel. Trocar sessão/conversa ou perder acesso descarta painel e seleção de mídia. As prévias do painel estão em [mídias](media.md#galeria-e-painel-do-contato).

Cards de contato compartilhado consultam a agenda pelo telefone, independentemente da busca/página da sidebar. Contatos salvos exibem apenas “Enviar mensagem”; os demais também exibem “Salvar contato”. Após salvar, essa ação é ocultada. Os telefones do vCard não associam PN/LID do remetente; veja [mensagens](messages.md#conteúdo-normalizado).

## Realtime

Alterações publicam `chat.contact.upserted` e atualizam as conversas vinculadas via `chat.conversation.upserted`. Inscrição e reconciliação estão em [realtime](realtime.md).
