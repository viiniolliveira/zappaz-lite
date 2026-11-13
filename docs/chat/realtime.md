# Realtime e sincronização do chat

[← Chat](README.md)

## Conexão e cache

Cada aba usa o Socket.IO compartilhado em `/api/ws`, com cookie HttpOnly; integrações usam API Key global ou restrita à sessão. Transporte, autorização e invalidações estão em [realtime da aplicação](../realtime.md).

Selecionar sessão real ativa REST (`src/services/chat.ts`) e listeners únicos de `realtimeChatEffectAtom`. `chat.session.subscribe`/`chat.session.unsubscribe` mantêm só sessão selecionada. Carregamento inicial espera ack; reconexão reinscreve e refaz snapshots/páginas carregadas. Cache combina HTTP/eventos por ID e revisão. Eventos não têm replay durável; HTTP reconcilia os dados.

Quando a capacidade de notificações é excedida, o controle compartilhado `app.resync` solicita nova reconciliação mesmo com o socket conectado. O chat refaz todas as páginas já carregadas e descarta o overlay antigo de eventos para não ressuscitar registros ausentes no snapshot; conversas removidas são tratadas sem manter uma seleção inválida. Rascunhos e envios otimistas pendentes não são apagados por saturação temporária. Sinais repetidos durante uma consulta são coalescidos, sem fila de mensagens ou cancelamento/reinício contínuo do snapshot. Detalhes de admissão, sinal e retry ficam em [realtime da aplicação](../realtime.md#limites-de-entrada).

Eventos de contato, conversa, mensagem, mídia e sync atualizam cache diretamente. `chat.session.revoked` remove acesso ao chat da sessão sem desconectar outros recursos. Regras específicas estão em [contatos](contacts.md#realtime), [conversas](conversations.md#realtime) e [etiquetas](labels.md#realtime-e-isolamento).

O chat não tem rodapé de status. Indicador compacto permanece no seletor; toasts Sonner com `richColors` informam conexão Socket.IO, WhatsApp, sync e falhas de consulta, com IDs independentes por sessão. Ações de reconectar, recarregar histórico, abrir sessão ou entrar novamente aparecem quando aplicáveis. Recarregar consulta persistência, não força sync WhatsApp. Avisos somem ao trocar sessão/sair; sem sessão não são criados.

## Indicador de digitação recebida

O backend converte `presence.update` com presença `composing` em `chat.typing`, no envelope padrão do chat, com `data: { conversationId }`. Somente conversas privadas existentes com mensagens persistidas são consideradas; PN e LID usam a identidade da sessão. Eventos próprios e de grupos são ignorados. A entrega exige inscrição e autorização na sessão, independentemente da configuração de webhooks.

Ao abrir uma conversa, a interface envia `chat.presence.subscribe` com `{ sessionId, conversationId }` pelo Socket.IO compartilhado, após a inscrição da sessão e com o WhatsApp conectado. O backend valida o acesso à sessão e busca o JID da conversa privada dentro dela antes de chamar `presenceSubscribe(jid)` na Baileys; a resposta é `{ ok: boolean }`. A assinatura é renovada ao reconectar o Socket.IO ou o WhatsApp, se a conversa continuar aberta. Não há assinatura automática de todos os chats. A Baileys não fornece uma operação de cancelamento dessa assinatura: ao fechar/trocar de conversa, o Zappaz não faz novas solicitações para a anterior, mas o WhatsApp pode continuar enviando eventos dela. Eventos recebidos continuam seguindo as configurações normais dos webhooks.

A interface exibe um bubble com três pontos ondulando no fim do histórico da conversa correspondente. Cada evento renova o prazo de 5 segundos. Uma nova mensagem recebida ao vivo remove o indicador; histórico, recibos e mensagens enviadas não o removem. Presença não é persistida e é limpa ao desconectar, perder acesso, excluir a conversa ou trocar/sair da sessão. A animação respeita movimento reduzido e não força rolagem de quem está lendo mensagens anteriores.

Digitar no compositor do Zappaz não emite presença. Não há indicador no cabeçalho nem na lista de conversas.

## Sincronização de histórico

`syncFullHistory` é `false` por padrão. Usuário ativa em Detalhes da sessão → Configurações para a próxima conexão; isso não obriga WhatsApp a reenviar histórico. A conexão mantém o perfil Chrome também com histórico completo; o perfil macOS Desktop apresentou falha na geração do QR code e loop de reconexão nos testes de uso. Não existe botão de ressincronização completa forçada.

Backend processa fila por sessão independente da página aberta. Toast persistente acompanha carregamento/espera, quantidade de mensagens processadas (incluindo reprocessamentos), conclusão ou falha. `chat.session.state` entrega progresso. Reabrir recupera estado atual sem anunciar conclusão antiga.

Progresso vive no processo; reiniciar não restaura contadores/lotes pendentes. Mensagens persistidas permanecem. Falhas preservam dados e aparecem no chat. Contatos sincronizados não viram agenda automaticamente; conversas sem mensagens não entram na lista, conforme [visibilidade](conversations.md#modelo-e-visibilidade).

## Diagnóstico de falhas no sync

`CONTACT_IDENTITY_CONFLICT` rejeita só item conflitante: loops de contatos, resumos e mensagens continuam e histórico avança nas etapas do lote. Associação/histórico existentes são preservados; cada mensagem valida identidade. Isolamento inclui `contacts.upsert`, `contacts.update`, `chats.upsert`, `chats.update` e `messages.upsert`; rejeitada não publica sucesso.

`WhatsApp batch processed with identity conflicts` resume sessão, evento e quantidades `processed`/`conflicts` por etapa em um aviso por lote com rejeições. Progresso conta itens processados sem conflito, não necessariamente novos registros: duplicados/ignorados também podem ter processamento. Itens ignorados antes da persistência de contato/conversa não incrementam contadores.

Sync com rejeições continua outros itens/lotes, permanece `saving` durante trabalho e termina `error` indicando resultado parcial. Outros erros (como banco indisponível) interrompem lote e geram `WhatsApp event processing failed`.

Falhas de mídia têm detalhe de download em `debug` e aviso de background com sessão/conversa/mídia/mensagem do erro. `MEDIA_UNAVAILABLE` classifica download sem bytes localmente, não confirma expiração no WhatsApp.
# Confirmação de falhas de sincronização

Quando houver uma falha de importação, `chat.session.state.data.syncProgress.errorId`
identifica o erro atual. Fechar o aviso ou selecionar “Recarregar histórico” envia
`chat.sync.acknowledge` com `{ sessionId, errorId }`, com resposta `{ ok: boolean }`.
O socket deve estar inscrito e autorizado na sessão.

A confirmação limpa somente a falha correspondente na memória do backend e publica
o estado atualizado para os clientes, sem apagar dados ou reiniciar a importação.
Uma falha posterior recebe outro ID; confirmações antigas não a removem. Se houver
trabalho pendente, a sincronização continua. “Recarregar histórico” também refaz
as consultas de conversas e mensagens habilitadas na interface.
