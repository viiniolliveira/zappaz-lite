# Mídias do chat

[← Chat](README.md)

## Upload e limites

`POST /api/v1/session/:sessionId/conversations/:conversationId/messages/media` recebe multipart com `file` binário, `kind`, `clientRequestId` e opcionais `caption`, `voice`, `replyToMessageRecordId`.

```sh
curl -X POST 'http://localhost:3001/api/v1/session/ID_DA_SESSAO/conversations/UUID_DA_CONVERSA/messages/media' \
  -H 'x-api-key: SUA_CHAVE' \
  -F 'file=@/caminho/foto.jpg' \
  -F 'kind=image' \
  -F 'caption=Foto do produto' \
  -F 'clientRequestId=00000000-0000-4000-8000-000000000001'
```

Gere um `clientRequestId` por envio lógico. Não defina Content-Type manualmente no multipart. Arquivo e saída convertida obedecem a `MEDIA_MAX_FILE_SIZE_MB` do backend (padrão 25 MiB); o body multipart permite mais 1 MiB de metadados (26 MiB no padrão). Retorna HTTP 201 com `{status:'success',data:MessageDTO}`. A validação definitiva é do backend.

`GET /api/v1/media/limits`, autenticado, retorna `{status:'success',data:{maxFileSizeBytes,maxFileSizeMb}}`. A interface compartilha essa consulta entre fila, editor, gravação e envio, sem `VITE_*` nem limite fixo no bundle. Durante carregamento/erro não aceita arquivos sem conhecer o limite, mas continua permitindo mensagens de texto. Veja [configuração e limites de corpo](../environment.md#tamanho-máximo-dos-arquivos).

`voice` é string `true`/`false`, só aceita `true` para áudio. Solicita conversão, não PTT. Todos os áudios do chat usam `ptt=false`. Anexos comuns (`voice=false`) preservam bytes e MIME detectado.

## Gravação de áudio

O gravador inline substitui a superfície do compositor. Usa `@kokonutui/ai-voice`, instalado com CLI shadcn/Bun e adaptado para cancelar, pausar, ouvir prévia, retomar e enviar. Ondas refletem microfone via Web Audio, sem demonstração. A prévia pausada usa fragmentos do MediaRecorder; erro de reprodução é informado sem perder a gravação.

Requer permissão, HTTPS/localhost, MediaRecorder e Web Audio. Navegador escolhe Ogg/Opus, WebM/Opus ou MP4. Envio inclui `voice=true`; texto digitado é preservado ao gravar/cancelar/enviar e não vira legenda do áudio. Desconexão pausa e bloqueia envio/retomada até reconectar. Cancelar, trocar sessão/conversa ou desmontar libera microfone/contexto; permissões pendentes não iniciam gravação após cancelar.

Áudio não persiste entre conversas/recargas; arquivos vazios não são enviados. Gravador fecha só após confirmação. Resultado não confirmado preserva prévia e bloqueia reenvio para evitar duplicação.

Backend requer `ffmpeg` no PATH com `libmp3lame` (já instalado na imagem Docker; instale localmente pelo sistema). Valida bytes e converte para MP3 mono a 48 kHz/128 kbps, MIME `audio/mpeg`, `ptt=false`. Usa pipes sem arquivos temporários, saída limitada por `MEDIA_MAX_FILE_SIZE_MB` e timeout de 30 segundos. Falha de conversão retorna 415; saída excessiva, 413; ausência de executável, 503, antes de enviar ao WhatsApp.

## Preparação e edição de anexos

Anexar abre `attachment-workspace.tsx` no lugar de histórico/compositor, preservando cabeçalho e sidebar. Aceita vários arquivos não vazios, cada um até o limite informado pelo backend (padrão 25 MiB). Miniaturas permitem selecionar/adicionar/remover; cada arquivo tem legenda própria. O rascunho vira legenda do primeiro arquivo válido. Imagem/vídeo têm preview local; PDF mostra somente a primeira página com React-PDF, ajustada ao espaço disponível e sem rolagem interna, zoom ou navegação. O cabeçalho mostra o nome do PDF e, logo abaixo, o total de páginas (`1 página`/`3 páginas`) obtido ao carregar o File local, sem download adicional e sem reutilizar a contagem de outro arquivo selecionado. Outros documentos mostram nome/tamanho. URLs locais são revogadas na troca/desmontagem.

“Editar” carrega `@image-ultra/react` 0.1.1 sob demanda, pt-BR e tokens do tema. JPEG/PNG/WebP aceitam ajustes/recorte, correções, filtros, anotações, ocultação, figurinhas, molduras, fundo, redimensionamento e marca d’água. Com pelo menos 768 px de largura, toolbar usa ícones com nome acessível e tooltip; abaixo, rótulos.

“Aplicar” substitui só arquivo da fila; o original pode ser restaurado antes do envio e não é modificado. Fechar preparação/cancelar edição exige confirmação. Durante edição, cabeçalho da preparação fica oculto; somente X nativo cancela, confirma descarte e retorna à preparação com arquivo anterior. Não há faixa ou fechar duplicado.

Envio é sequencial, sem endpoint de lote. Só itens confirmados saem da fila. Falha/resultado não confirmado interrompe e bloqueia novo envio até remover item marcado após conferir histórico. Desconexão preserva fila enquanto conversa aberta; trocar sessão/conversa desmonta fila e impede próximos envios, sem cancelar requisição iniciada. Não persiste entre conversas/recargas.

## Persistência, miniaturas e downloads

Persistência opcional usa FlyDrive, desativado por padrão, sob `sessionId/conversationId/messageId`. Sem persistência baixa do WhatsApp pelo downloader oficial do Baileys. A miniatura base64 fornecida pelo WhatsApp é salva em coluna de `WaMessageMedia` independentemente dos arquivos e exposta no DTO. Configuração: [ambiente](../environment.md#persistência-privada-de-mídias-backend).

Downloads recebidos usam `downloadMediaMessage` oficial do Baileys, incluindo transporte nativo, descriptografia e callback `updateMediaMessage` para o fluxo de reupload da biblioteca. `whatsapp-media-download.ts` integra essa função ao limite compartilhado de quatro recuperações/processamentos por processo, sem fila. Antes do download e após reupload, valida o destino efetivo com a política compartilhada: somente HTTP/HTTPS sem credenciais e sem IPs literais privados/reservados. Preserva a escolha de host e a precedência de `directPath` da biblioteca, sem forçar um CDN único. A saída é rejeitada se superar `MEDIA_MAX_FILE_SIZE_MB` (padrão 25 MiB), após ser acumulada pelo Baileys. Não há transporte, descriptografia nem verificação de MAC implementados pelo aplicativo. Esse fluxo não usa o Axios protegido: DNS-pinning, bloqueio de redirects, deadline de 15 segundos e limite de bytes durante a transferência não são garantidos pelo wrapper nativo. O usuário confirmou que a restauração do downloader oficial resolveu os downloads em produção; isso não comprova as proteções pendentes.

O sync e o recebimento/envio de mensagens salvam os metadados e a miniatura recebida, sem iniciar downloads de arquivos ou gerar miniaturas em segundo plano. A recuperação ocorre somente quando a mídia é solicitada pelo chat ou pela API de integração:

- **FileSystem/S3:** retorna o arquivo persistido quando disponível; caso contrário, baixa do WhatsApp em binário, salva pelo FlyDrive e registra `storage`, `key`, `persistedAt` e `storageStatus=ready` após o salvamento. Solicitações seguintes reutilizam o arquivo salvo.
- **Sem persistência:** baixa do WhatsApp e retorna os bytes sem salvar o arquivo; uma nova solicitação pode exigir novo download.
- Solicitações simultâneas da mesma mídia compartilham o download em andamento. Miniaturas originais são preservadas; para imagens sem miniatura, ela é gerada ao recuperar o arquivo, inclusive sem persistência habilitada.

O endpoint JSON de integração `/media/base64` converte para base64 somente na resposta; `/media/binary` retorna os bytes. Os arquivos são persistidos em binário. Arquivos ainda não solicitados dependem da disponibilidade no WhatsApp e podem expirar antes do primeiro acesso.

Na interface, imagens, stickers e áudios solicitam o arquivo automaticamente ao entrar na área visível, usando a mesma fila com até três downloads simultâneos. Áudios mostram carregamento até o player ficar disponível, sem reprodução automática; é necessário clicar em play para ouvir. Falhas permitem tentar novamente. Isso não inicia downloads durante o sync nem para áudios ainda fora da área visível.

`GET /api/v1/session/:sessionId/conversations/:conversationId/media/:mediaId/content` retorna binário HTTP 200/206 com `Range`; range inválido retorna 416. Não confundir com [download JSON da integração](../api.md#downloads-realtime-e-erros).

O download exige autenticação e acesso à sessão; os IDs de sessão, conversa e mídia precisam pertencer ao mesmo escopo, inclusive para administradores e para sessões do mesmo proprietário. Trocar um ID interno por outro de uma sessão/conversa diferente não concede acesso. `HEAD` e requisições `Range` preservam a autorização e `Cache-Control: private, no-store`; o caminho do arquivo no armazenamento não é uma URL pública.

Thumbnails JPEG chegam no DTO. Durante o download de uma imagem, a miniatura é ampliada no espaço reservado para a mídia e mostra um spinner central, reduzindo mudanças de tamanho quando o arquivo completo chega. Nos balões da conversa, imagens, stickers e áudios são solicitados quando visíveis; vídeos e documentos, ao abrir. No resumo e na biblioteca lateral, os cards mostram somente miniaturas do DTO ou ícones; arquivos completos são solicitados somente ao abrir o visualizador. No modal de todas as conversas, imagens e vídeos são solicitados quando os cards ficam visíveis. Até três downloads simultâneos, com cancelamento ao descartar e Blob URLs revogadas no cleanup. `not_saved` não é falha de download. Não há bytes completos base64 no cache global.

## Listagem de mídias

`GET /api/v1/session/:sessionId/conversations/:conversationId/media` aceita `limit` (1–100, default 50), `cursor` e `kind=image|video|audio|document|sticker|gallery`. `gallery` inclui áudio/imagem/vídeo/documento não removido da sessão/conversa.

Para `kind=gallery`, a consulta começa pelas mídias mais recentes, em `orderAt DESC,id DESC`, e o cursor busca registros menores (anteriores). A interface reordena os itens carregados em ordem crescente, da esquerda para a direita. Os demais filtros mantêm `orderAt ASC,id ASC`, com cursor avançando para valores maiores. Resposta inclui `data`, `page:{nextCursor,hasMore}` e `count`, total do escopo/filtro sem cursor/limite. Cada item contém DTO da mídia e `message` com DTO completo da mensagem.

Cursores são opacos/assinados: preserve sessão, conversa e filtro; não fabrique nem reutilize entre escopos, e codifique na URL.

## Galeria e painel do contato

O painel consulta sob demanda a biblioteca com `kind=media&limit=4` para as quatro mídias mais recentes e `kind=all&limit=1` para a contagem única, independente do histórico carregado. Clicar em uma miniatura busca a mensagem selecionada e abre a galeria sem inserir mensagens isoladas no histórico.

Áudio, imagem/vídeo e documentos não PDF abrem a galeria da conversa em Dialog de tela inteira, no item clicado. Usa `@reui/c-carousel-8` (principal) e `@reui/c-carousel-4` (miniaturas), adaptados em `components/chat/media-gallery*.tsx`. Setas, miniaturas, gestos e Escape navegam/fecham; foco retorna ao arquivo de origem. Selecionar um PDF durante a navegação mostra seu nome e o botão “Abrir PDF”, sem abrir automaticamente o visualizador. Somente essa ação abre o visualizador exclusivo descrito abaixo; ao fechá-lo, a galeria mantém o item selecionado e o foco volta ao botão.

Abertura e próximas páginas usam `kind=gallery&limit=24`; só última página pode ter menos itens. Total exibido vem de `count`, não miniaturas carregadas. Botão “Carregar mídias anteriores” é compacto, com ícone de histórico/tooltip, alinhado às miniaturas; carrega pelo `nextCursor` e mostra spinner desabilitado.

`chatMediaGalleryAtom` mantém páginas por sessão/conversa. Item clicado fica disponível fora das páginas; paginação não duplica nem troca seleção. Apenas mídia ativa baixa/renderiza arquivo completo, imediatamente e sem depender de IntersectionObserver no portal. Reutiliza Blob do balão com URL própria; miniaturas usam DTO. Trocar/fechar cancela downloads e revoga URLs. Documentos não PDF oferecem nome/download, sem visualizador externo.

Durante o carregamento, o painel do contato e a faixa de miniaturas da galeria mostram quatro skeletons quadrados. A prévia principal de imagem/vídeo sem miniatura mostra um skeleton; quando já existe miniatura, ela permanece visível com o indicador de carregamento. Os placeholders usam o tema atual, respeitam movimento reduzido e são substituídos pelo conteúdo, erro ou estado vazio ao terminar.

### Consultas da biblioteca

`GET /api/v1/session/:sessionId/library` consulta `WaMessage`, com a mesma autenticação e escopo de sessão das conversas. Aceita `kind=media|document|link|all` (padrão `media`), `conversationId` opcional, `limit` (1–100; padrão 50) e `cursor`.

- `media`: mensagens de imagem e vídeo com mídia associada; com `conversationId` (biblioteca lateral e resumo), inclui também áudio. Sem `conversationId` (modal de todas as conversas), exclui áudios no banco, inclusive da contagem e paginação.
- `document`: mensagens de documento com mídia associada, incluindo PDFs.
- `link`: mensagens com `hasLink = true`, mesmo sem prévia ou com link na legenda.
- `all`: união das categorias, contando uma mensagem com mídia e link apenas uma vez. O resumo do contato usa essa contagem e consulta separadamente quatro mídias recentes para as miniaturas.

Sem `conversationId`, a consulta reúne as conversas privadas da sessão; com o parâmetro, valida a conversa e restringe os resultados. Não inclui grupos nem mensagens removidas. Retorna `{ status, data, count, page }`; cada item contém `message` e um resumo de `conversation` (`id`, `sessionId`, `displayName`, `avatarUrl`). A consulta não baixa arquivos. Filtros, contagem total e paginação são realizados no banco; contagem e itens são consultados juntos em uma transação. A ordem é `orderAt`/ID da mensagem decrescente, com cursores assinados vinculados à sessão, conversa e categoria.

O endpoint existente `GET .../conversations/:conversationId/media` também usa mensagens como base, preservando os itens de mídia com mensagem associada e `count`. Os cursores são próprios dessa consulta, não IDs ou datas de criação de arquivos. A galeria usa esse endpoint com `kind=gallery`, pagina das recentes para as anteriores e exibe os itens cronologicamente; as bibliotecas lateral e da sessão usam `getChatLibrary`.

### Interface da biblioteca

O modal e a biblioteca lateral usam rolagem infinita nas três abas: ao aproximar o fim do conteúdo rolável, buscam a próxima página pelo cursor, sem botão “Carregar mais”. Não disparam páginas em paralelo, interrompem ao terminar ou falhar e oferecem nova tentativa explícita no erro. No modal, a grade de mídia contém somente imagens/vídeos e fica rente às laterais e à parte inferior; cabeçalho, títulos de grupos e linhas de documentos/links preservam seu espaçamento interno, sem moldura externa no Dialog. Áudios permanecem disponíveis na biblioteca lateral.

As informações do contato mantêm somente o resumo “Mídia, links e documentos”, a contagem de mensagens da união e até quatro miniaturas recentes, incluindo áudio. Clicar no resumo substitui as informações pela biblioteca lateral da conversa; o botão de voltar retorna às informações, sem fechar o painel.

A biblioteca lateral tem abas Mídia, Documentos e Links, grade de três colunas agrupada por mês e carregamento paginado. Áudios, imagens e vídeos ficam juntos em Mídia e abrem na galeria de visualização existente. Áudios aparecem na grade com duração e usam o mesmo player de áudio do chat dentro da galeria, sem reprodução automática. Documentos e links mostram conteúdo, remetente e data. Listas mantêm skeletons, estado vazio, falha com nova tentativa e miniaturas disponíveis.

“Ver mídias de todas as conversas” abre um modal da sessão atual, sem restringir à conversa selecionada. No mobile (abaixo de 768 px), ocupa a tela inteira, sem margens externas nem cantos arredondados; no desktop, permanece centralizado. O modal mantém as mesmas abas, grade responsiva com nome da conversa e agrupamentos Hoje, Ontem, Esta semana, Semana passada e mês. Documentos e links usam colunas de arquivo/link, legenda/mensagem e remetente no desktop, empilhadas no mobile. URLs vêm do parser seguro compartilhado, sem buscar prévias externas.

Os cards do resumo e da biblioteca lateral exibem somente a miniatura base64 disponível no DTO, sem solicitar arquivos completos ao montar ou rolar a grade. Quando a miniatura está ausente ou inválida, mostram o ícone do tipo de mídia, sem spinner, skeleton permanente ou tentativa de download. Áudios e vídeos preservam a duração. Clicar em um card abre a galeria, que solicita somente o arquivo da mídia selecionada pelo fluxo existente de `useChatMedia`.

No modal de todas as conversas, os cards usam `useChatMedia` para carregar imagens e vídeos ao entrar na área visível, com o limite compartilhado de três downloads simultâneos. Durante o carregamento e a decodificação, preservam a miniatura com indicador de carregamento ou mostram skeleton quando não há miniatura. A imagem completa ou o primeiro quadro do vídeo substitui a prévia ao ficar pronto; vídeos ficam pausados e sem som. Falhas preservam a miniatura e oferecem nova tentativa. Abrir um card pronto reutiliza seu blob no visualizador. Fechar o modal ou trocar a aba cancela downloads pendentes e revoga as URLs locais. O nome da conversa permanece no card.

Na aba Links, a prévia do texto da mensagem mostra somente as duas primeiras linhas, com reticências quando há excesso, tanto na biblioteca lateral quanto no modal. Quebras de linha e formatação são preservadas, sem truncar o conteúdo original da mensagem. As URLs continuam clicáveis na coluna Link; a prévia textual não cria links ocultos fora das duas linhas visíveis. A aba Documentos não recebe esse limite.

No modal, o título do link ocupa somente uma linha com reticências. O título completo fica disponível no tooltip nativo e o destino da âncora permanece intacto. A prévia da mensagem continua limitada a duas linhas.

Selecionar áudio, imagem, vídeo ou documento abre a galeria/visualizador existente com a sessão e conversa do item. O player de áudio reutiliza o blob já carregado pela galeria, sem uma segunda requisição do arquivo, e desmonta ao navegar para outra mídia. PDFs são abertos apenas pelo clique explícito no documento. Fechar a galeria mantém o modal, a aba e a rolagem e devolve o foco ao item selecionado. A navegação entre abas ou a abertura das listas não baixa documentos/áudios automaticamente. Eventos de mensagens e mídia invalidam o resumo e as bibliotecas da conversa e da sessão.

### Visualizador de PDF

Abrir um PDF no histórico ou no painel do contato mostra somente esse documento, em tela cheia sobre fundo escuro, sem carrossel nem miniaturas de outros arquivos. O cabeçalho mantém remetente, nome, data, download e fechar. Escape fecha e restaura o foco na origem.

`pdf-viewer.tsx` reutiliza `useChatMedia` para recuperar o binário autenticado e escopado à sessão/conversa, ou o Blob já disponível. Abrir diretamente um PDF não consulta a biblioteca inteira. O reconhecimento usa MIME `application/pdf`; a extensão `.pdf` serve apenas quando o MIME está ausente ou é genérico (`application/octet-stream`).

`pdf-document.tsx` carrega `react-pdf` (PDF.js) sob demanda, não `@react-pdf/renderer` ou iframe. Renderiza páginas roláveis com texto selecionável, links, página atual, campo de navegação, anterior/próxima, zoom de 50–300% relativo à largura ajustada e ação “Ajustar à largura”. Somente páginas próximas à área visível mantêm canvas; placeholders preservam o espaço das demais. O layout se ajusta ao celular.

Worker, CMaps, fontes padrão e decodificadores são servidos pela própria aplicação, sem CDN/visualizador externo. O Vite publica os recursos auxiliares em `/pdfjs/`. O documento é entregue ao PDF.js como bytes; o download continua usando a Blob URL, revogada ao fechar. A CSP permite WebAssembly para os decodificadores, sem permitir eval JavaScript.

Falhas de download, leitura e renderização oferecem nova tentativa; PDFs protegidos por senha orientam baixar e abrir em aplicativo compatível, sem solicitar ou armazenar senhas. Arquivos inválidos não impedem usar o download disponível no cabeçalho. Na preparação do envio, a prévia da primeira página usa o File local, não cria iframe nem envia dados ao servidor; falhas/proteção por senha não impedem enviar o arquivo original.

## Players e balões

Áudio usa Audio Player e Waveform do [audiocn](https://audiocn.dev/docs/components/audio-player), instalados com shadcn/Bun (`@audiocn/audio-player`, `@audiocn/waveform`). `messages/message-audio.tsx` combina avatar/fallback com microfone, transporte centralizado, waveform interativa e tempos. Download só ao solicitar; waveform usa mesmo Blob sem nova requisição. Se decodificação falhar, barra de posição acessível, sem amplitudes inventadas. Controles preservam teclado/pt-BR.

Fontes do registry pertencem ao projeto, adaptadas ao Vite sem `'use client'`. Hooks/contextos ficam em `hooks/`, providers/controles em `components/ui/`; `useAudioPlayerContext` vem de `@/hooks/use-audio-player-context`, providers opcionais em `ui/audio-context-provider.tsx` e `ui/audio-config-provider.tsx`.

Vídeos usam [Video Player Pro da Ruixen](https://ruixen.com/r/video-player-pro), fonte em `src/components/ruixen/video-player-pro.tsx`, adaptada ao Vite/pt-BR/primitivas. Inclui controles translúcidos, animação de velocidade, reprodução, replay, posição, volume/mute e fullscreen. Ranges suportam toque/teclado; setas ajustam vídeo sem navegar galeria. Velocidade se adapta à largura, sem sons artificiais; erros têm recuperação e trocar/fechar pausa reprodução.

Stickers não têm fundo/borda de balão nem moldura; horário/status abaixo, tombstone normal para removidos. Imagem/vídeo usam padding de 4 px e a mídia define largura: legendas, URLs e erros quebram dentro dela. Arquivos indisponíveis preservam largura de miniatura/placeholder. Horário/status aparecem uma vez no canto inferior direito com gradiente, sem capturar clique da galeria; legenda/erros ficam fora. Reprodução/download de vídeo ficam na galeria.

Templates mantêm mídia, legenda e erro na largura do card, mesmo com miniatura pequena ou indisponibilidade. Imagens comuns definem largura do próprio balão; stickers/grades têm dimensionamento específico.

Quatro ou mais imagens sem legenda do mesmo remetente/sessão/conversa/dia formam grade de duas colunas quadradas. Texto vazio/espaços não é legenda. Vídeo, imagens com legenda, texto, áudio, sticker e removidas interrompem sequência. Cada item preserva ID, citação, reações e horário/status. Clique abre item na galeria, com download após carregar arquivo. Agrupamento é visual, sem alterar armazenamento ou cursores de leitura.
