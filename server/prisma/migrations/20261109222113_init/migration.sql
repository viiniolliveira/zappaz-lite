-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'audio', 'document', 'location', 'contact');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apikey" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT,
    "start" TEXT,
    "prefix" TEXT,
    "key" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "refillInterval" INTEGER,
    "refillAmount" INTEGER,
    "lastRefillAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rateLimitTimeWindow" INTEGER NOT NULL DEFAULT 60000,
    "rateLimitMax" INTEGER NOT NULL DEFAULT 120,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "remaining" INTEGER,
    "lastRequest" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissions" TEXT,
    "metadata" TEXT,

    CONSTRAINT "Apikey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSession" (
    "id" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disconnectedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "jid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "profilePictureUrl" TEXT,
    "displayName" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaileysAuthState" (
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaileysAuthState_pkey" PRIMARY KEY ("sessionId","key")
);

-- CreateTable
CREATE TABLE "WaConfig" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "syncFullHistory" BOOLEAN NOT NULL DEFAULT false,
    "markOnlineOnConnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ignoreGroups" BOOLEAN NOT NULL DEFAULT false,
    "clientConnectionName" TEXT,
    "rejectCalls" BOOLEAN NOT NULL DEFAULT false,
    "messageOnCall" TEXT,
    "signatureEnabled" BOOLEAN NOT NULL DEFAULT false,
    "signatureName" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaSendMessageHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientJid" TEXT NOT NULL,
    "type" "MessageType",

    CONSTRAINT "WaSendMessageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "senderJid" TEXT,
    "senderName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'unknown',
    "text" TEXT,
    "hasLink" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "orderAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "clientRequestId" TEXT,
    "content" JSONB NOT NULL DEFAULT '{}',
    "rawContent" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" INTEGER,

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "lid" TEXT,
    "name" TEXT,
    "pushName" TEXT,
    "localName" TEXT,
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "annotations" TEXT,
    "avatarUrl" TEXT,
    "avatarCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaQuickMessage" (
    "id" UUID NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaQuickMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversationLabel" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "WaConversationLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversationLabelLink" (
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "WaConversationLabelLink_pkey" PRIMARY KEY ("sessionId","conversationId","labelId")
);

-- CreateTable
CREATE TABLE "WaConversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contactId" TEXT,
    "jid" TEXT NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageId" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadMessageId" TEXT,
    "lastReadOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessageMedia" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileName" TEXT,
    "size" DOUBLE PRECISION,
    "duration" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "voice" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailBase64" TEXT,
    "thumbnailMimeType" TEXT,
    "thumbnailWidth" INTEGER,
    "thumbnailHeight" INTEGER,
    "storage" TEXT,
    "key" TEXT,
    "persistedAt" TIMESTAMP(3),
    "storageStatus" TEXT NOT NULL DEFAULT 'not_saved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WaMessageMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversationDeletion" (
    "conversationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "historyBefore" TIMESTAMP(3) NOT NULL,
    "storages" TEXT[],
    "filesDeletedAt" TIMESTAMP(3),

    CONSTRAINT "WaConversationDeletion_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "events" JSONB NOT NULL,
    "waSessionId" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "displayName" TEXT,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response" JSONB NOT NULL,
    "url" TEXT,
    "event" TEXT,
    "sessionId" TEXT,
    "webhookDisplayName" TEXT,
    "waSessionEventId" TEXT,
    "payload" JSONB,
    "messageId" TEXT,
    "parentLogId" TEXT,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalWebhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "events" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headers" JSONB NOT NULL,

    CONSTRAINT "GlobalWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Apikey_configId_idx" ON "Apikey"("configId");

-- CreateIndex
CREATE INDEX "Apikey_referenceId_idx" ON "Apikey"("referenceId");

-- CreateIndex
CREATE INDEX "Apikey_key_idx" ON "Apikey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "WaSession_userId_idx" ON "WaSession"("userId");

-- CreateIndex
CREATE INDEX "WaSession_userId_archived_displayName_idx" ON "WaSession"("userId", "archived", "displayName");

-- CreateIndex
CREATE INDEX "WaSession_archived_displayName_idx" ON "WaSession"("archived", "displayName");

-- CreateIndex
CREATE INDEX "WaSession_status_archived_enabled_connectedAt_idx" ON "WaSession"("status", "archived", "enabled", "connectedAt");

-- CreateIndex
CREATE INDEX "BaileysAuthState_expiresAt_idx" ON "BaileysAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaConfig_sessionId_key" ON "WaConfig"("sessionId");

-- CreateIndex
CREATE INDEX "WaSendMessageHistory_sessionId_createdAt_idx" ON "WaSendMessageHistory"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WaMessage_sessionId_messageId_idx" ON "WaMessage"("sessionId", "messageId");

-- CreateIndex
CREATE INDEX "WaMessage_sessionId_orderAt_id_idx" ON "WaMessage"("sessionId", "orderAt", "id");

-- CreateIndex
CREATE INDEX "WaMessage_sessionId_conversationId_orderAt_id_idx" ON "WaMessage"("sessionId", "conversationId", "orderAt", "id");

-- CreateIndex
CREATE INDEX "WaMessage_sessionId_hasLink_orderAt_id_idx" ON "WaMessage"("sessionId", "hasLink", "orderAt", "id");

-- CreateIndex
CREATE INDEX "WaMessage_sessionId_type_orderAt_id_idx" ON "WaMessage"("sessionId", "type", "orderAt", "id");

-- CreateIndex
CREATE INDEX "WaMessage_createdAt_idx" ON "WaMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_sessionId_conversationId_messageId_key" ON "WaMessage"("sessionId", "conversationId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_sessionId_conversationId_id_key" ON "WaMessage"("sessionId", "conversationId", "id");

-- CreateIndex
CREATE INDEX "WaContact_sessionId_name_id_idx" ON "WaContact"("sessionId", "name", "id");

-- CreateIndex
CREATE INDEX "WaContact_sessionId_isSaved_localName_id_idx" ON "WaContact"("sessionId", "isSaved", "localName", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_sessionId_jid_key" ON "WaContact"("sessionId", "jid");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_sessionId_phoneNumber_key" ON "WaContact"("sessionId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_sessionId_lid_key" ON "WaContact"("sessionId", "lid");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_sessionId_id_key" ON "WaContact"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaQuickMessage_sessionId_command_key" ON "WaQuickMessage"("sessionId", "command");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversationLabel_sessionId_name_key" ON "WaConversationLabel"("sessionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversationLabel_sessionId_id_key" ON "WaConversationLabel"("sessionId", "id");

-- CreateIndex
CREATE INDEX "WaConversationLabelLink_sessionId_labelId_conversationId_idx" ON "WaConversationLabelLink"("sessionId", "labelId", "conversationId");

-- CreateIndex
CREATE INDEX "WaConversation_sessionId_isGroup_lastActivityAt_id_idx" ON "WaConversation"("sessionId", "isGroup", "lastActivityAt", "id");

-- CreateIndex
CREATE INDEX "WaConversation_sessionId_contactId_idx" ON "WaConversation"("sessionId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversation_sessionId_jid_key" ON "WaConversation"("sessionId", "jid");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversation_sessionId_id_key" ON "WaConversation"("sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessageMedia_messageId_key" ON "WaMessageMedia"("messageId");

-- CreateIndex
CREATE INDEX "WaMessageMedia_sessionId_conversationId_createdAt_id_idx" ON "WaMessageMedia"("sessionId", "conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessageMedia_storage_key_key" ON "WaMessageMedia"("storage", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessageMedia_sessionId_conversationId_messageId_key" ON "WaMessageMedia"("sessionId", "conversationId", "messageId");

-- CreateIndex
CREATE INDEX "WaConversationDeletion_sessionId_jid_deletedAt_idx" ON "WaConversationDeletion"("sessionId", "jid", "deletedAt");

-- CreateIndex
CREATE INDEX "WaConversationDeletion_filesDeletedAt_idx" ON "WaConversationDeletion"("filesDeletedAt");

-- CreateIndex
CREATE INDEX "Webhook_waSessionId_idx" ON "Webhook"("waSessionId");

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_event_createdAt_idx" ON "WebhookLog"("webhookId", "event", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_webhookId_createdAt_idx" ON "WebhookLog"("webhookId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookLog_sessionId_idx" ON "WebhookLog"("sessionId");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookLog_parentLogId_idx" ON "WebhookLog"("parentLogId");

-- AddForeignKey
ALTER TABLE "Apikey" ADD CONSTRAINT "Apikey_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaSession" ADD CONSTRAINT "WaSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConfig" ADD CONSTRAINT "WaConfig_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaSendMessageHistory" ADD CONSTRAINT "WaSendMessageHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_sessionId_conversationId_fkey" FOREIGN KEY ("sessionId", "conversationId") REFERENCES "WaConversation"("sessionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaQuickMessage" ADD CONSTRAINT "WaQuickMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversationLabel" ADD CONSTRAINT "WaConversationLabel_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversationLabelLink" ADD CONSTRAINT "WaConversationLabelLink_sessionId_conversationId_fkey" FOREIGN KEY ("sessionId", "conversationId") REFERENCES "WaConversation"("sessionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversationLabelLink" ADD CONSTRAINT "WaConversationLabelLink_sessionId_labelId_fkey" FOREIGN KEY ("sessionId", "labelId") REFERENCES "WaConversationLabel"("sessionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_sessionId_contactId_fkey" FOREIGN KEY ("sessionId", "contactId") REFERENCES "WaContact"("sessionId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageMedia" ADD CONSTRAINT "WaMessageMedia_sessionId_conversationId_messageId_fkey" FOREIGN KEY ("sessionId", "conversationId", "messageId") REFERENCES "WaMessage"("sessionId", "conversationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageMedia" ADD CONSTRAINT "WaMessageMedia_sessionId_conversationId_fkey" FOREIGN KEY ("sessionId", "conversationId") REFERENCES "WaConversation"("sessionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_waSessionId_fkey" FOREIGN KEY ("waSessionId") REFERENCES "WaSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_parentLogId_fkey" FOREIGN KEY ("parentLogId") REFERENCES "WebhookLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Serialize removal/demotion across processes, including native admin endpoints.
CREATE FUNCTION protect_last_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."role" <> 'ADMIN' OR OLD."banned" THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."role" = 'ADMIN' AND NOT NEW."banned" THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('zappaz:last-admin', 0));
  IF NOT EXISTS (
    SELECT 1 FROM "User" WHERE "role" = 'ADMIN' AND NOT "banned" AND "id" <> OLD."id"
  ) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator' USING ERRCODE = '23514', CONSTRAINT = 'User_last_admin';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_protect_last_admin"
BEFORE UPDATE OF "role", "banned" OR DELETE ON "User"
FOR EACH ROW EXECUTE FUNCTION protect_last_admin();
