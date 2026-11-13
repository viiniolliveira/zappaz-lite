# Etiquetas de conversas

[← Chat](README.md)

## Regras

Etiquetas são locais ao Zappaz e pertencem à sessão. O vínculo é com a **conversa**, nunca com o contato ou WhatsApp; uma conversa aceita várias etiquetas. Excluir uma conversa remove seus vínculos e preserva catálogo e contato; uma nova conversa começa sem etiquetas. A agenda não é afetada.

## Endpoints e contrato

Base: `/api/v1/session/:sessionId`.

| Método e rota | Contrato |
| --- | --- |
| `GET /conversation-labels` | `{status:'success',data:LabelDTO[]}`, ordenado por nome/ID. |
| `POST /conversation-labels` | Cria e retorna etiqueta (201). |
| `PATCH /conversation-labels/:labelId` | Atualiza etiqueta. |
| `DELETE /conversation-labels/:labelId` | Exclui etiqueta e vínculos, preservando conversas, contatos e mensagens; retorna `{status:'success',data:{labelId}}`. |
| `PUT /conversations/:conversationId/labels` | Substitui vínculos com `{labelIds:string[]}`; até 100 IDs distintos, `[]` remove todos. Exige conversa privada e etiquetas da mesma sessão; retorna `ConversationDTO`. |

Criação/edição recebem `{name,description,color}`: nome obrigatório, único por sessão, até 60 caracteres; descrição até 500 caracteres (`''` quando ausente); cor hexadecimal `#rrggbb`. `LabelDTO` também inclui `id` e `sessionId`. `ConversationDTO.labelIds: string[]` é obrigatório.

As rotas usam a autorização de sessão existente e funcionam sem conexão ativa com o WhatsApp.

## Seletores e gerenciamento

O seletor no cabeçalho permite várias etiquetas, mantém o menu aberto e salva cada alteração imediatamente. Exibe cor/nome para uma etiqueta e “N selecionadas” para várias. Os detalhes também mostram os vínculos atuais.

O menu do card abre “Escolher etiquetas”: lista com cores e checkboxes à direita, criação no topo e Cancelar/Confirmar no rodapé. Mudanças só persistem ao confirmar; cancelar descarta a seleção temporária.

Os seletores oferecem criação e gerenciamento. O formulário usa React Hook Form e Zod, com nome, descrição opcional, 16 cores prontas e input de cor personalizada. Seletores de etiquetas usam checkboxes. Excluir pede confirmação e preserva conversas. Botões, modal e dropdown seguem o arredondamento global dos componentes shadcn, sem sobrescrita local.

## Filtro e apresentação

`GET /conversations?labelId=UUID` filtra por **uma** etiqueta antes da paginação, combinado com `q`. O filtro participa da chave de cache e do escopo do cursor; não se reutiliza cursor com outra etiqueta.

Ao lado de “Todas / Não lidas”, marcar outra etiqueta substitui a anterior; “Todas as etiquetas” limpa o filtro. Esse filtro não aparece na agenda.

Cards exibem etiquetas passivas, até duas tags compactas em uma linha abaixo da prévia, nomes truncados e “+N” para as restantes. Nomes completos ficam disponíveis ao passar o mouse. Não há dropdown nem bolinhas substituindo as tags; edição fica no cabeçalho e menu de ações.

## Operações em lote

“Alterar etiquetas” abre uma lista de checkboxes, sem menu de operação. Ao abrir, a interface consulta todas as conversas selecionadas no servidor, inclusive as que estão fora da página ou busca atual. Cada etiqueta aparece marcada se estiver em todas, com traço (estado parcial) se estiver em algumas, ou desmarcada se não estiver em nenhuma.

Marcar aplica a etiqueta a todas; desmarcar remove de todas. Somente as etiquetas alteradas são aplicadas: estados parciais não tocados e outros vínculos são preservados. Cancelar descarta as mudanças; Confirmar só é habilitado após uma alteração. Falha no carregamento bloqueia edição e oferece nova tentativa, sem agregar dados incompletos.

Ao confirmar, a interface consulta novamente cada conversa e aplica as alterações sobre os vínculos atuais, reutilizando o endpoint individual sequencialmente pelo fluxo `atom → service → backend`. Não envia atualização quando os vínculos já correspondem ao pedido. Sucessos atualizam cache; falhas parciais mantêm somente as conversas malsucedidas selecionadas, recarregando a agregação para nova tentativa.

## Realtime e isolamento

Mudanças no catálogo publicam `app.invalidate` com `resource:'conversation-labels'` após commit. Vínculos incrementam a revisão e publicam `chat.conversation.upserted` com `labelIds`; excluir uma etiqueta também publica as conversas que perderam o vínculo. A interface invalida os caches locais.

Troca de sessão, perda de acesso e saída do chat limpam filtros e superfícies de edição. Catálogo e vínculos usam o [Socket.IO compartilhado](realtime.md), sem sincronização de etiquetas com WhatsApp.
