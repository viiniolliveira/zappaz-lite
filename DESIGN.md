---
name: Zappaz Lite
description: Sistema existente da interface de operação do Zappaz Lite.
colors:
  primary: "oklch(0.707 0.1891 151.2213)"
  primary-foreground: "oklch(0.2626 0.0147 166.4589)"
  background: "oklch(0.9911 0 0)"
  foreground: "oklch(0.2046 0 0)"
  border: "oklch(0.9037 0 0)"
  muted: "oklch(0.9461 0 0)"
  dark-background: "oklch(0.1822 0 0)"
  dark-card: "oklch(0.2046 0 0)"
  dark-primary: "oklch(0.6271 0.1699 149.2138)"
typography:
  title:
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
  body:
    fontSize: "14px"
    lineHeight: "20px"
  label:
    fontSize: "12px"
    lineHeight: "16px"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
---

# Design System: Zappaz Lite

## Overview

Registro descritivo do sistema já presente em `src/global.css`, nas primitivas `src/components/ui/` e no layout autenticado. A tela de chat o estende, sem introduzir uma nova identidade.

**Key Characteristics:**
- Superfícies neutras nos temas claro e escuro.
- Verde do produto para ações e seleção.
- Navegação lateral e composição compacta de operação.

## Colors

### Temas

Os temas são gerados com o [tweakcn](https://tweakcn.com/). Para adicionar novos temas, utilize esse site.

### Primary

O verde do produto sinaliza ações principais, item de navegação ativo e contagens de não lidas. Tons translúcidos do mesmo token distinguem seleções e mensagens enviadas.

### Neutral

Fundo, texto, superfície, texto secundário e borda vêm dos tokens semânticos de `src/global.css`. A classe `.dark` substitui esses papéis; componentes não definem temas próprios.

## Typography

Títulos de página usam o papel `title`; mensagens e controles usam `body`; metadados usam `label` ou tamanhos menores observados nos horários. Números e horários usam alinhamento tabular quando necessário.

A família declarada no CSS é `Outfit, sans-serif`, mas o carregamento dessa fonte não está estabelecido no entrypoint atual. Esta documentação não transforma o fallback renderizado em uma decisão tipográfica nova.

## Layout

O dashboard usa sidebar existente e conteúdo com largura máxima de 64rem nas telas gerais. O chat é uma exceção: ocupa toda a largura e altura disponíveis, sem margem externa, limite de largura ou moldura de card. Lista, histórico, cabeçalho e compositor usam o mesmo `bg-background` da aplicação, com divisórias sutis e padding interno nos controles. Lista e histórico mantêm rolagens internas. Em telas abaixo de 768px, lista e conversa aparecem alternadamente; a navegação global continua usando a sidebar mobile existente.

## Elevation & Depth

O chat usa separação tonal e bordas, sem sombras adicionais. Primitivas existentes podem usar as sombras baixas do tema para campos e botões outline. Foco visível reutiliza o token `ring`; movimento reduzido é tratado globalmente.

## Shapes

Cantoneiras suavemente arredondadas, bordas de um pixel e avatares circulares. Botões e campos usam as primitivas existentes; a área de chat não tem moldura externa nem cantos arredondados.

## Components

- **Minha conta:** página `/account` no layout padrão de até 64rem, com seções independentes de dados pessoais e senha. Superfícies `bg-background`, iguais ao fundo da aplicação, bordas e cantos `rounded-lg`, padding de 16px no mobile e 24px no desktop. Campos em duas colunas a partir de `sm`, uma no mobile; formulários diretamente na página, sem drawer.
- **Usuários:** página `/users` exclusiva para administradores, com título, descrição, ação de adicionar, tabela e paginação existentes. Criação/edição usam o Sheet existente e exclusão exige confirmação. O menu marca somente a rota correspondente, sem confundir `/use` e `/users`.

- **Botões:** variantes primary, outline e ghost da primitiva `Button`; foco visível e desabilitado preservados.
- **Campos:** `Input` e `Textarea`, com rótulos acessíveis, cores semânticas e foco da biblioteca.
- **Navegação:** sidebar existente; item ativo recebe fundo primary. A navegação mobile não é reimplementada.
- **Conversas:** linhas clicáveis com avatar, nome, prévia truncada, horário e indicador de não lidas. Seleção usa primary translúcido.
- **Mensagens:** bolhas recebidas em card e enviadas em primary translúcido; conteúdo extenso quebra sem alargar a tela.
- **Áudio:** audiocn composto em uma linha compacta, com avatar circular/microfone, play centralizado verticalmente, waveform do arquivo real e tempos abaixo. Reutilize os tokens do tema; sem player nativo do navegador.
- **Stickers:** imagem transparente sem balão, borda ou fundo; horário/status em uma pequena superfície separada abaixo.
- **Imagens e vídeos:** moldura compacta com padding de 4px; horário e status no canto inferior direito sobre a mídia, com gradiente escuro para contraste, sem bloquear controles do vídeo. Legendas continuam abaixo da mídia.
- **Sequências de mídia:** quatro ou mais imagens/vídeos consecutivos do mesmo remetente formam uma grade de duas colunas, com prévias quadradas e espaçamento de 4px. Cada item mantém horário/status e ações próprios.

## Do's and Don'ts

- **Do** reutilizar tokens semânticos e primitivas existentes, como confirmado no pedido.
- **Do** manter textos de interface em pt-BR, inclusive rótulos acessíveis.
- **Don't** trocar a identidade do produto ao acrescentar uma tela.
