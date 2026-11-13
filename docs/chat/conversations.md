# Conversas do chat

[← Chat](README.md)

## Modelo e visibilidade

Existe uma conversa por contato/JID dentro da sessão, sem tickets ou múltiplos atendimentos. Grupos não aparecem na interface.

A lista, busca, paginação e contagem exibem somente conversas privadas com ao menos uma mensagem persistida, inclusive `unknown` ou marcada como removida. Contatos e resumos sincronizados podem existir internamente sem aparecer na lista; registros vazios não são apagados automaticamente. Envios otimistas, pendentes ou malsucedidos não contam como histórico confirmado.

O filtro de existência de mensagens é aplicado no banco antes do limite/cursor, junto da busca. O índice de mensagens por sessão/conversa atende à consulta. O detalhe de uma conversa vazia continua acessível para iniciar um envio.

## Abertura e listagem

Antes de gravar cada lote do histórico, os pares explícitos de `lidPnMappings`, contatos e `remoteJidAlt` são coletados e usados para associar PN/LID antes da criação das conversas. Contatos e mensagens também aproveitam `getPNForLID()` quando a Baileys já conhece o par. Falhas nessa consulta são registradas e não impedem a ingestão do payload original.

Após cada lote, os pares recebidos enriquecem os contatos sem telefone correspondentes; `lid-mapping.update` também aplica atualizações direcionadas, inclusive depois do sync. Após a conclusão do histórico e o processamento dos lotes pendentes, uma passagem adicional consulta os demais contatos com LID e sem telefone. Não há consulta reversa USync nem unificação de históricos. Conflitos de unicidade são registrados e preservam os registros envolvidos. A interface recebe atualizações após a gravação.

Base: `/api/v1/session/:sessionId`.

- `POST /conversations`: recebe `{contactId}` ou `{phoneNumber}`, exclusivos. Retorna a conversa com 201 se criada ou 200 se existente. Abrir pelo telefone reutiliza/cria identidade interna sem salvar na agenda nem enviar mensagem.
- `GET /conversations`: lista conversas visíveis. Aceita `q` (até 200 caracteres), `limit` (1–100, default 50), `cursor` e `labelId`.
- `GET /conversations/:conversationId`: consulta individual, inclusive sem histórico.

A busca é por nome/telefone/JID, não conteúdo de mensagens. O atraso de busca está em [contatos](contacts.md#paginação). A interface oferece filtro de não lidas e [filtro por uma etiqueta](labels.md#filtro-e-apresentação).

Os botões “Todas”, “Não lidas” e “Etiquetas” usam o arredondamento padrão dos botões, derivado do tema selecionado, sem formato de pílula fixo.

O painel de conversas tem um cabeçalho de 72 px com divisória inferior alinhada aos cabeçalhos da conversa e dos detalhes do contato. Dentro dele, o switcher de sessões segue o padrão TeamSwitcher do shadcn: avatar, nome e status em duas linhas, sem label externo “Sessão”. O menu lista somente sessões habilitadas, indica a selecionada e abre à direita no desktop ou abaixo no mobile. Trocar a sessão preserva a limpeza de seleção, filtros e painéis; selecionar a sessão já ativa não altera o estado. A página `/use` mantém seu seletor atual.

No mobile, abrir uma conversa oculta a barra global com menu e usuário, liberando sua altura para o chat. O cabeçalho da conversa mantém “Voltar para conversas”, que restaura a lista e a barra global. A navegação desktop e as outras páginas não mudam. O chat usa a altura dinâmica da janela e respeita as áreas seguras do dispositivo; o viewport solicita redimensionamento do conteúdo ao abrir o teclado nos navegadores compatíveis.

```json
{"status":"success","data":[],"page":{"nextCursor":null,"hasMore":false}}
```

Enquanto `hasMore=true`, envie `nextCursor` em `cursor`, preservando busca, etiqueta e sessão. Cursores são opacos e assinados: não use IDs, não os fabrique nem reutilize com filtros/escopos diferentes. Codifique o cursor na URL.

“Nova conversa” abre o compositor sem histórico; a conversa entra na lista quando o snapshot confirma a primeira mensagem persistida. Eventos normais só publicam conversas com mensagens. A retenção pode publicar snapshot vazio após remover a última mensagem, retirando a conversa da lista sem excluir o registro. O cache aplica a visibilidade após combinar snapshots.

## Leitura local

`PATCH /conversations/:conversationId/read-state` recebe `{read:boolean}` e retorna `{status:'success',data:ConversationDTO}`. Valida sessão e conversa privada com histórico e funciona mesmo com WhatsApp desconectado.

- `read:true`: zera não lidas e posiciona o cursor na última mensagem persistida.
- `read:false`: preserva contagem positiva ou usa 1 como indicador manual; limpa o cursor para permitir leitura ao reabrir.

Não envia recibos nem modifica o WhatsApp. Novas mensagens recebidas continuam incrementando a contagem. Marcar uma conversa aberta como não lida fecha seu painel até reabri-la.

A leitura automática é marcada ao abrir uma conversa com não lidas, após carregar o histórico, e ao receber novas mensagens com conversa aberta e aba visível. O cursor só avança por `(orderAt,id)` e ignora mensagens otimistas. Rolagem, paginação, reações e recibos não disparam `/read`; conversas já lidas não geram requisições redundantes.

## Seleção e ações em lote

Botão direito no card abre o Context Menu do shadcn. Conversas também oferecem seta com “Selecionar conversa”, “Marcar como lida/não lida”, etiquetas e “Excluir conversa”. Abrir o menu não seleciona nem exclui nada. As ações são locais ao Zappaz.

No modo de seleção, cards tornam-se botões alternáveis acessíveis por teclado; clicar seleciona sem abrir. O contador, botão de fechar e menu de ações em lote substituem os filtros. Busca e paginação preservam os IDs, inclusive fora da busca atual. Fechar, abrir agenda, trocar sessão ou sair do chat limpa a seleção.

Ações em lote reutilizam endpoints individuais. Falhas parciais mantêm somente as conversas malsucedidas selecionadas e exibem resultado parcial. Exclusão exige confirmação; etiquetas em lote estão no [guia de etiquetas](labels.md#operações-em-lote).

## Exclusão definitiva local

`DELETE /conversations/:conversationId` exclui permanentemente conversa, histórico, miniaturas e mídias apenas no Zappaz; preserva contato, catálogo de etiquetas e chat no WhatsApp. Remove os vínculos de etiquetas por cascade.

Retorna `{status:'success',data:{conversationId,mediaCleanup:'complete'|'pending'}}` e publica `chat.conversation.deleted`. Limpezas pendentes são repetidas automaticamente. O painel de detalhes reutiliza a confirmação de exclusão existente. Não confundir com [“Apagar para todos” de uma mensagem](messages.md#ações-e-exclusão-no-whatsapp).

## Realtime

Mudanças de leitura e vínculos publicam snapshots de conversa após persistir, com revisão incrementada. O cache atualiza lista, badges e filtros. Veja [realtime](realtime.md) e [limpeza de sessão](../api.md#exclusão-definitiva-de-sessão).
