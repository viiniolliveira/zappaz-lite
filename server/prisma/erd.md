```mermaid
erDiagram
    User {
        STRING id PK
        STRING email

        BOOLEAN emailVerified
        BOOLEAN banned
        STRING banReason
        DATETIME banExpires
        STRING image
        DATETIME updatedAt
        STRING firstName
        STRING lastName
        STRING phone
        ENUM role
        DATETIME createdAt
    }
    WaSession {
        STRING id PK
        STRING token
        STRING secret
        STRING displayName
        STRING status
        STRING jid
        STRING profilePictureUrl
        BOOLEAN enabled
        DATETIME createdAt
        DATETIME updatedAt
        DATETIME disconnectedAt
        DATETIME connectedAt
        STRING userId FK
    }
    AuthSession {
        STRING id PK
        STRING userId FK
        STRING token UK
        DATETIME expiresAt
        STRING ipAddress
        STRING userAgent
        STRING impersonatedBy
    }
    Account {
        STRING id PK
        STRING userId FK
        STRING accountId
        STRING providerId
        STRING password
    }
    Verification {
        STRING id PK
        STRING identifier
        STRING value
        DATETIME expiresAt
    }
    User ||--o{ AuthSession : authenticates
    User ||--o{ Account : credentials
    Apikey {
        STRING id PK
        STRING referenceId FK
        STRING configId
        STRING name
        STRING start
        STRING key "hash SHA-256"
        BOOLEAN enabled
        DATETIME expiresAt
        DATETIME lastRequest
        INT rateLimitMax
        INT rateLimitTimeWindow
    }
    User ||--o{ Apikey : integration_credentials
    WaConfig {
        STRING id PK
        STRING sessionId FK
        STRING clientConnectionName
        STRING messageOnCall
        STRING signatureName
        BOOLEAN signatureEnabled
        BOOLEAN rejectCalls
        BOOLEAN syncFullHistory
        BOOLEAN ignoreGroups
        BOOLEAN markOnlineOnConnect
        DATETIME createdAt
        DATETIME updatedAt
    }
    WaSendMessageHistory {
        STRING id PK
        STRING sessionId FK
        STRING recipientJid
        DATETIME createdAt
        DATETIME updatedAt
    }
    WaMessage {
        STRING id PK
        STRING sessionId FK
        STRING conversationId FK
        STRING messageId "WhatsApp ID"
        BOOLEAN fromMe
        STRING type
        STRING text
        BOOLEAN hasLink "Link persistido para filtros da biblioteca"
        DATETIME orderAt
        INT revision
        INT status
        JSON content
        JSON rawContent
        DATETIME createdAt
        DATETIME updatedAt
    }
    WaContact {
        STRING id PK
        STRING sessionId FK
        STRING jid
        STRING phoneNumber
        STRING lid
        STRING name
        STRING pushName
        STRING localName "Nome definido no Zappaz"
        BOOLEAN isSaved "Salvo na agenda local"
        STRING email "Email local opcional"
        STRING annotations "Anotações locais opcionais"
        STRING avatarUrl "URL externa da foto"
        DATETIME avatarCheckedAt "Última consulta bem-sucedida; cache de 1 hora"
        INT revision
    }
    WaConversation {
        STRING id PK
        STRING sessionId FK
        STRING contactId FK
        STRING jid
        BOOLEAN isGroup
        STRING lastMessageId
        INT unreadCount
        STRING lastReadMessageId
        DATETIME lastActivityAt
        INT revision
    }
    WaQuickMessage {
        UUID id PK
        STRING sessionId FK
        STRING name
        STRING command "Único por sessão, sem /"
        STRING message "Até 4096 caracteres"
        DATETIME createdAt
        DATETIME updatedAt
    }
    WaConversationLabel {
        STRING id PK
        STRING sessionId FK
        STRING name "Único por sessão"
        STRING description
        STRING color "Hexadecimal #rrggbb"
    }
    WaConversationLabelLink {
        STRING sessionId PK,FK
        STRING conversationId PK,FK
        STRING labelId PK,FK
    }
    WaMessageMedia {
        STRING id PK
        STRING sessionId FK
        STRING conversationId FK
        STRING messageId FK "Internal message UUID"
        STRING thumbnailBase64
        STRING storageStatus
        STRING storage
        STRING key
        INT revision
    }
    WaConversationDeletion {
        STRING conversationId PK
        STRING sessionId
        STRING jid
        DATETIME deletedAt
        DATETIME historyBefore
        STRING_ARRAY storages
        DATETIME filesDeletedAt
    }
    Webhook {
        STRING id PK
        STRING url
        STRING displayName
        BOOLEAN enabled
        JSON events
        JSON headers
        DATETIME createdAt
        STRING waSessionId FK
    }
    WebhookLog {
        STRING id PK
        STRING webhookId FK
        STRING webhookDisplayName
        STRING event
        STRING sessionId
        DATETIME createdAt
        JSON response
    }
    GlobalWebhook {
        STRING id PK
        STRING url
        BOOLEAN enabled
        JSON events
        JSON headers
        DATETIME createdAt
    }

    User ||--o{ WaSession : "sessions"
    WaSession ||--|| WaConfig : "config"
    WaSession ||--o{ WaMessage : "messages"
    WaSession ||--o{ WaContact : "contacts"
    WaSession ||--o{ WaConversation : "conversations"
    WaSession ||--o{ WaConversationLabel : "local labels"
    WaSession ||--o{ WaQuickMessage : "local quick messages"
    WaConversation ||--o{ WaConversationLabelLink : "same-session labels"
    WaConversationLabel ||--o{ WaConversationLabelLink : "conversation links"
    WaContact o|--o{ WaConversation : "same-session contact"
    WaConversation ||--o{ WaMessage : "scoped messages"
    WaConversation ||--o{ WaMessageMedia : "scoped media"
    WaMessage ||--o| WaMessageMedia : "file metadata and thumbnail"
    WaSession ||--o{ WaSendMessageHistory : "sendMessageHistory"
    WaSession ||--o{ Webhook : "webhooks"
    Webhook ||--o{ WebhookLog : "logs"

```

`WaConversationDeletion` é um recibo sem conteúdo de mensagens: impede restauração de histórico e permite repetir limpeza de arquivos. Não possui FK para conversa/sessão, pois precisa sobreviver às respectivas exclusões. Excluir `WaConversation` remove mensagens e mídias por cascade, mas preserva `WaContact`.

`WaConversationLabel` mantém o catálogo de etiquetas por sessão. `WaConversationLabelLink` permite várias etiquetas por conversa, com FKs compostas que impedem vínculos entre sessões. Excluir a etiqueta ou a conversa remove apenas os vínculos correspondentes por cascade; excluir uma conversa não exclui o catálogo de etiquetas. Contatos não recebem etiquetas.

`WaContact.phoneNumber` guarda o telefone em dígitos e `lid` guarda o JID `@lid`, com unicidades independentes por sessão. Ambos são opcionais; `jid` e os UUIDs permanecem estáveis ao enriquecer a identidade. Associações vêm apenas do payload WhatsApp; conflitos entre referências/históricos são rejeitados.

## Índices de consulta de mensagens

- `WaMessage(sessionId, orderAt, id)`: paginação cronológica de mensagens da sessão, sem filtro de conversa.
- `WaMessage(sessionId, conversationId, orderAt, id)`: paginação do histórico de uma conversa.
- `WaMessage(sessionId, messageId)` e a unicidade `(sessionId, conversationId, messageId)`: busca pelo ID WhatsApp dentro da sessão/conversa.
- `WaConversation(sessionId, contactId)`: localização das conversas do contato identificado por telefone, LID ou JID. Os identificadores de `WaContact` têm unicidade por sessão.
