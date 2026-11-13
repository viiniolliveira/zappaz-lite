import { release } from 'node:os'
import { prisma } from '@db/prisma'
import { Prisma, type Webhook } from '@generated/prisma'
import { MessageType } from '@generated/prisma/index.js'
import { Boom, isBoom } from '@hapi/boom'
import { createBaileysAuthStateCacheManager } from '@lib/baileys-auth-state'
import { baileysLogger, logger } from '@lib/logger'
import { TTLCacheStore } from '@lib/ttl-cache-store'
import {
  cleanBase64String,
  getBase64Buffer,
  getFileName,
  getMimeTypeFromBase64,
  getMimeTypeFromUrl,
  isBase64,
  isUrl,
  parseAxiosHeaders,
  sleep,
} from '@lib/utils'
import { publishWebhookLogCreated } from '@lib/webhook-log-publisher'
import {
  type AudioMessage,
  type CreateWASessionConfig,
  DefaultDisappearingMode,
  type MediaMessage,
  type TextSignature,
  type WAPrivacyOnlineValue,
  type WAPrivacyValue,
  type WAReadReceiptsValue,
  type WebhookEvents,
  WebhookEventsSchema,
} from '@server/common/schema'
import { AccessDeniedError, InvalidJidError, InvalidMediaError } from '@services/errors'
import { AxiosError, type AxiosResponse } from 'axios'
import {
  type AnyMediaMessageContent,
  type AnyMessageContent,
  type BaileysEventMap,
  type CacheStore,
  type Contact,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
  isJidNewsletter,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeWASocket,
  type ParticipantAction,
  proto,
  type SignalKeyStore,
  type WAConnectionState,
  type WAMessage,
  type WAPresence,
  type WAPrivacyGroupAddValue,
  type WAProto,
} from 'baileys'
import qrcode, { type QRCodeToDataURLOptions } from 'qrcode'
import { RateLimitedError } from '../common/errors/rate-limited-error.ts'
import { publishAppInvalidation } from './app-events.ts'
import axiosInstance from './axios-instance.ts'
import { enrichContactPhones } from './chat-contact-enrichment.ts'
import { publishChatChange } from './chat-events.ts'
import { ChatHistorySync } from './chat-history-sync.ts'
import {
  contactIdentifiers,
  isContactIdentityConflict,
  messageContactIdentifiers,
} from './chat-identity.ts'
import { publishReceivedTyping } from './chat-presence.ts'
import {
  type ChatBatchResult,
  deleteChatMessages,
  findLegacyMessage,
  storeChatMessage,
  storeChatReaction,
  storeChatSummaries,
  storeContacts,
  updateChatMessage,
} from './chat-store.ts'
import { signTextMessage } from './message-signature.ts'
import { outboundLinkPreview } from './outbound-link-preview.ts'
import { clearSessionMessages } from './session-deletion.ts'
import { webhookMessage } from './webhook-message.ts'
import {
  type LookupPhone,
  resolveContactPhone,
  resolveMessagePhone,
} from './whatsapp-contact-identity.ts'
import {
  normalizeMessageReactions,
  normalizeMessageReceipts,
  normalizeMessageUpdates,
  normalizeWhatsappMessageWithThumbnails,
} from './whatsapp-event-normalizer.ts'
import { interactiveContent } from './whatsapp-interactive.ts'
import { downloadWhatsappMedia } from './whatsapp-media-download.ts'

type AwaitedWASocket = Awaited<ReturnType<typeof makeWASocket>>
type AwaitedAuthStateCacheManager = Awaited<ReturnType<typeof createBaileysAuthStateCacheManager>>

interface ContactWithJid extends Contact {
  jid: string
}

const QR_MAX_RETRIES = 5
const QR_TIMEOUT = 45_000

export class WhatsappSession {
  private readonly historySync = new ChatHistorySync(
    () => {
      publishChatChange({
        sessionId: this.id,
        state: {
          connected: this.status === 'open',
          enabled: this.enabled,
          ...this.syncState,
        },
      })
    },
    async () => {
      const client = this.client
      if (!client) return
      try {
        await enrichContactPhones(this.id, async (lid) => {
          if (client !== this.client || this.markedForDeletion || this.logoutTask) return null
          return client.signalRepository.lidMapping.getPNForLID(lid)
        })
      } catch (error) {
        logger.error({ err: error, sessionId: this.id, msg: 'Post-sync contact enrichment failed' })
      }
    },
  )

  get syncState() {
    return {
      syncStatus: this.historySync.status,
      syncProgress: this.historySync.progress,
    }
  }
  acknowledgeHistorySyncError(errorId: string) {
    this.historySync.acknowledgeError(errorId)
  }
  private _id: string
  private _status: WAConnectionState = 'close'
  private _qrCode: string | null = null
  private _qrCodeBase64: string | null = null
  private _webhooks: Webhook[] = []
  private _jid: string | null = null
  private _jidAlt: string | null = null
  private _profilePictureUrl: string | null = null
  private _enabled: boolean
  private _displayName: string
  private _userId: string | null
  private _qrRetries = 0
  private markedForDeletion = false
  private logoutTask: Promise<void> | null = null
  private readonly pendingEvents = new Set<Promise<void>>()
  private client: AwaitedWASocket | null = null
  private config: CreateWASessionConfig
  private authStateCacheManager: AwaitedAuthStateCacheManager | null = null
  private userDevicesCache: CacheStore = new TTLCacheStore()
  private msgRetryCounterCache: CacheStore = new TTLCacheStore()
  private _onEventForwarded: (
    sessionId: string,
    event: keyof typeof WebhookEventsSchema.shape,
    payload: unknown,
  ) => Promise<void>

  constructor(
    id: string,
    enabled: boolean,
    config: CreateWASessionConfig,
    displayName: string,
    userId: string | null,
  ) {
    this._id = id
    this._enabled = enabled
    this._displayName = displayName
    this._userId = userId
    this.config = config
    this._onEventForwarded = async () => {}

    // We don't want to waste memory on disabled sessions, nor do we want a
    // socket connection that will be instantly disconnected.
    if (this.enabled) {
      this.createClient()
    }
  }

  get id() {
    return this._id
  }

  get status() {
    return this._status
  }

  get qrCode() {
    return this._qrCode
  }

  get qrCodeBase64() {
    return this._qrCodeBase64
  }

  get jid() {
    return this._jid
  }

  set jid(number: string | null) {
    this._jid = number
  }

  // Expose the alternate jid (with @lid) if present
  get jidAlt() {
    return this._jidAlt
  }

  set jidAlt(number: string | null) {
    this._jidAlt = number
  }

  get webhooks() {
    return this._webhooks
  }

  set webhooks(webhooks: Webhook[]) {
    this._webhooks = webhooks
  }

  get enabled() {
    return this._enabled
  }

  set enabled(enabled: boolean) {
    this._enabled = enabled
  }

  get onEventForwarded() {
    return this._onEventForwarded
  }

  set onEventForwarded(onEventForwarded: (
    sessionId: string,
    event: keyof typeof WebhookEventsSchema.shape,
    payload: unknown,
  ) => Promise<void>) {
    this._onEventForwarded = onEventForwarded
  }

  get profilePictureUrl() {
    return this._profilePictureUrl
  }

  set profilePictureUrl(url: string | null) {
    this._profilePictureUrl = url
  }

  get displayName() {
    return this._displayName
  }

  set displayName(displayName: string) {
    this._displayName = displayName
  }

  get userId() {
    return this._userId
  }

  set userId(userId: string | null) {
    this._userId = userId
  }

  private incrementQrRetries() {
    this._qrRetries++
  }

  private resetQrRetries() {
    this._qrRetries = 0
  }

  private async createClient() {
    if (this.markedForDeletion || this.logoutTask) return
    const { version } = await fetchLatestBaileysVersion()
    if (this.markedForDeletion || this.logoutTask) return

    this.authStateCacheManager = await createBaileysAuthStateCacheManager(this.id)

    if (this.markedForDeletion || this.logoutTask) return
    const client = makeWASocket({
      version,
      auth: {
        creds: this.authStateCacheManager.state.creds,
        keys: makeCacheableSignalKeyStore(
          this.authStateCacheManager.state.keys as SignalKeyStore,
          baileysLogger,
        ),
      },
      logger: baileysLogger,
      generateHighQualityLinkPreview: true,
      printQRInTerminal: false,
      fireInitQueries: true,
      connectTimeoutMs: 30_000,
      keepAliveIntervalMs: 30_000,
      qrTimeout: QR_TIMEOUT,
      emitOwnEvents: false,
      syncFullHistory: this.config.syncFullHistory,
      markOnlineOnConnect: this.config.markOnlineOnConnect,
      userDevicesCache: this.userDevicesCache,
      msgRetryCounterCache: this.msgRetryCounterCache,
      transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
      browser: [this.config.clientConnectionName, 'Chrome', release()],
      getMessage: this.getMessage,
      shouldSyncHistoryMessage: () => this.config.syncFullHistory,
      shouldIgnoreJid: (jid) => {
        return isJidNewsletter(jid) || (this.config.ignoreGroups && isJidGroup(jid))
      },
    })
    this.client = client
    this.attachEventListeners(client)
  }

  private attachEventListeners(client: AwaitedWASocket) {
    client.ev.process(async (events) => {
      if (this.markedForDeletion || this.logoutTask || client !== this.client) return
      const tasks = [
        ['call', this.onCall(events.call)],
        [
          'connection.update',
          events['connection.update']?.connection === 'close'
            ? Promise.resolve()
            : this.onConnectionUpdate(events['connection.update']),
        ],
        ['messaging-history.set', this.onMessagingHistorySet(events['messaging-history.set'])],
        ['chats.upsert', this.onChatsUpsert(events['chats.upsert'])],
        ['chats.update', this.onChatsUpdate(events['chats.update'])],
        ['chats.delete', this.onChatsDelete(events['chats.delete'])],
        ['labels.association', this.onLabelsAssociation(events['labels.association'])],
        ['labels.edit', this.onLabelsEdit(events['labels.edit'])],
        ['presence.update', this.onPresenceUpdate(events['presence.update'])],
        ['contacts.upsert', this.onContactsUpsert(events['contacts.upsert'])],
        ['contacts.update', this.onContactsUpdate(events['contacts.update'])],
        ['lid-mapping.update', this.onLidMapping(events['lid-mapping.update'])],
        ['creds.update', this.onCredsUpdate(events['creds.update'])],
        ['messages.delete', this.onMessagesDelete(events['messages.delete'])],
        ['messages.update', this.onMessagesUpdate(events['messages.update'])],
        ['messages.media-update', this.onMessagesMediaUpdate(events['messages.media-update'])],
        ['messages.upsert', this.onMessagesUpsert(events['messages.upsert'])],
        ['messages.reaction', this.onMessagesReaction(events['messages.reaction'])],
        ['message-receipt.update', this.onMessageReceiptUpdate(events['message-receipt.update'])],
        ['groups.upsert', this.onGroupsUpsert(events['groups.upsert'])],
        ['groups.update', this.onGroupsUpdate(events['groups.update'])],
        [
          'group-participants.update',
          this.onGroupParticipantsUpdate(events['group-participants.update']),
        ],
        ['blocklist.set', this.onBlocklistSet(events['blocklist.set'])],
        ['blocklist.update', this.onBlocklistUpdate(events['blocklist.update'])],
      ] as const
      const work = Promise.allSettled(tasks.map(([, task]) => task)).then((results) => {
        for (const [index, result] of results.entries()) {
          if (result.status === 'rejected')
            logger.error({
              msg: 'WhatsApp event processing failed',
              stack: result.reason instanceof Error ? result.reason.stack : undefined,
              extra: {
                source: 'whatsapp-session',
                function: 'attachEventListeners',
                sessionId: this.id,
                event: tasks[index][0],
                error:
                  result.reason instanceof Error ? result.reason.message : String(result.reason),
              },
            })
        }
      })
      this.pendingEvents.add(work)
      const historyStatus = events['messaging-history.status']
      if (
        historyStatus?.syncType === proto.HistorySync.HistorySyncType.FULL &&
        historyStatus.status === 'complete'
      ) {
        void this.historySync
          .enqueue(async () => {}, true)
          .catch((error) => {
            logger.error({
              err: error,
              sessionId: this.id,
              msg: 'History completion failed',
            })
          })
      }
      await work
      this.pendingEvents.delete(work)
      // Connection cleanup can drain data events without waiting on its own promise.
      if (
        events['connection.update']?.connection === 'close' &&
        !this.markedForDeletion &&
        !this.logoutTask &&
        client === this.client
      ) {
        try {
          await this.onConnectionUpdate(events['connection.update'])
        } catch (error) {
          logger.error({
            msg: 'WhatsApp event processing failed',
            stack: error instanceof Error ? error.stack : undefined,
            extra: {
              source: 'whatsapp-session',
              function: 'attachEventListeners',
              sessionId: this.id,
              event: 'connection.update',
              error: error instanceof Error ? error.message : String(error),
            },
          })
        }
      }
    })
  }

  private async logWebhookEvent({
    event,
    webhook,
    response,
    payload,
    resendUrl,
    parentLogId,
  }: {
    event: keyof typeof WebhookEventsSchema.shape
    webhook: Webhook
    response: AxiosResponse | undefined
    payload?: unknown
    resendUrl?: string
    parentLogId?: string
  }) {
    try {
      // Deep-clone the payload and strip base64Media so we don't persist
      // large media blobs. base64Media will be re-fetched on retry via
      // downloadMediaMessage(messageId).
      let storedPayload: Prisma.InputJsonValue | null = null
      let messageId: string | null = null
      if (payload && typeof payload === 'object') {
        const stripped = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
        if (stripped.base64Media) {
          stripped.base64Media = null
        }
        const message = stripped.message as { messageId?: string } | undefined
        const data = stripped.data as { key?: { id?: string } } | undefined
        messageId = message?.messageId ?? data?.key?.id ?? null
        storedPayload = stripped as Prisma.InputJsonValue
      }

      const log = await prisma.webhookLog.create({
        data: {
          event,
          url: resendUrl ?? webhook.url,
          parentLogId,
          sessionId: this.id,
          webhookId: webhook.id,
          webhookDisplayName: webhook.displayName,
          response: {
            status: response?.status,
            data: null,
            headers: parseAxiosHeaders(response),
          },
          payload: storedPayload ?? Prisma.JsonNull,
          messageId,
        },
      })
      void publishWebhookLogCreated(log)
      publishAppInvalidation({
        resource: 'logs',
        sessionId: this.id,
        webhookId: webhook.id,
        ownerId: this._userId,
        origin: null,
      })
      return log
    } catch (error) {
      logger.warn({
        msg: `Error logging webhook event: ${event}, webhook: ${webhook.id}`,
        error: error instanceof Error ? error.message : error,
      })
      return null
    }
  }

  private async forwardEvent({
    event,
    payload,
    resend = false,
    webhookId,
    url,
    parentLogId,
  }: {
    event: keyof typeof WebhookEventsSchema.shape
    payload: unknown
    resend?: boolean
    webhookId?: string
    url?: string
    parentLogId?: string
  }) {
    // Also reject persisted or untyped events before logs, retry or global delivery.
    if (!Object.hasOwn(WebhookEventsSchema.shape, event)) return null
    if (!(this.enabled || resend)) {
      logger.warn({
        msg: `Prevented forwarding event: ${event}, session must be enabled.`,
        sessionId: this.id,
      })
      return null
    }
    for (const webhook of this.webhooks) {
      if (webhookId && webhook.id !== webhookId) continue
      const events = webhook.events as WebhookEvents
      const headers = webhook.headers as Record<string, string>
      const shouldForward = resend || (webhook.enabled && events[event])
      if (shouldForward) {
        try {
          const response = await axiosInstance({
            maxContentLength: 64 * 1024,
            method: 'POST',
            url: resend ? url : webhook.url,
            data: {
              event,
              payload,
              session: {
                id: this.id,
                status: this.status,
                jid: this.jid,
              },
            },
            headers: {
              'Content-Type': 'application/json',
              ...(headers || {}),
            },
          })
          const log = await this.logWebhookEvent({
            event,
            webhook,
            response,
            payload,
            resendUrl: url,
            parentLogId,
          })
          if (webhookId && log) return log
          logger.info(`Forwarded event: ${event}, webhook: ${webhook.id}`)
        } catch (error) {
          if (error instanceof AxiosError) {
            const log = await this.logWebhookEvent({
              event,
              webhook,
              response: error.response,
              payload,
              resendUrl: url,
              parentLogId,
            })
            if (webhookId && log) return log
          }
          logger.warn({
            msg: `Error forwarding event: ${event}, webhook: ${webhook.id}`,
            url: url ?? webhook.url,
            sessionId: this.id,
            error: error instanceof Error ? error.message : error,
          })
        }
      }
    }
    if (!resend) {
      this.onEventForwarded(this.id, event, payload)
    }
    return null
  }

  private async registerSendMessage(recipientJid: string, type: MessageType) {
    try {
      await prisma.waSendMessageHistory.create({
        data: {
          recipientJid,
          sessionId: this.id,
          type,
        },
      })
      publishAppInvalidation({ resource: 'usage', sessionId: this.id, ownerId: this._userId })
    } catch (error) {
      logger.warn({
        msg: `Error registering message.send event, sessionId: ${this.id}`,
        sessionId: this.id,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private logBatchConflicts(event: string, results: Record<string, ChatBatchResult>) {
    if (!Object.values(results).some((result) => result.conflicts)) return
    logger.warn({
      msg: 'WhatsApp batch processed with identity conflicts',
      extra: {
        source: 'whatsapp-session',
        function: 'logBatchConflicts',
        sessionId: this.id,
        event,
        ...results,
      },
    })
  }

  private async onCall(eventPayload?: BaileysEventMap['call']) {
    if (!eventPayload) return
    const call = eventPayload[0]
    if (call.status === 'offer') {
      if (this.config.rejectCalls) {
        await this.client?.rejectCall(call.id, call.from)
      }
      if (this.config.messageOnCall) {
        await this.sendMessage(call.from, { text: this.config.messageOnCall }, MessageType.text, {
          delay: 1000,
        })
      }
    }
    this.forwardEvent({
      event: 'call',
      payload: eventPayload,
    })
  }

  private async onChatsUpsert(eventPayload?: BaileysEventMap['chats.upsert']) {
    if (!eventPayload) return
    const conversations = await storeChatSummaries(this.id, eventPayload)
    this.logBatchConflicts('chats.upsert', { conversations })
    this.forwardEvent({
      event: 'chats.upsert',
      payload: eventPayload,
    })
  }

  private async onChatsUpdate(eventPayload?: BaileysEventMap['chats.update']) {
    if (!eventPayload) return
    const conversations = await storeChatSummaries(this.id, eventPayload)
    this.logBatchConflicts('chats.update', { conversations })
    this.forwardEvent({
      event: 'chats.update',
      payload: eventPayload,
    })
  }

  private async onChatsDelete(eventPayload?: BaileysEventMap['chats.delete']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'chats.delete',
      payload: eventPayload,
    })
  }

  private async onLabelsAssociation(eventPayload?: BaileysEventMap['labels.association']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'labels.association',
      payload: eventPayload,
    })
  }

  private async onLabelsEdit(eventPayload?: BaileysEventMap['labels.edit']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'labels.edit',
      payload: eventPayload,
    })
  }

  private async onPresenceUpdate(eventPayload?: BaileysEventMap['presence.update']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'presence.update',
      payload: eventPayload,
    })
    await publishReceivedTyping(
      this.id,
      eventPayload,
      [this.client?.user?.id, this.client?.user?.lid].filter((jid): jid is string => !!jid),
    )
  }

  private async onContactsUpsert(eventPayload?: BaileysEventMap['contacts.upsert']) {
    if (!eventPayload) return
    const contacts = await this.saveContacts(eventPayload)
    this.logBatchConflicts('contacts.upsert', { contacts })
    this.forwardEvent({
      event: 'contacts.upsert',
      payload: eventPayload,
    })
  }

  private async onContactsUpdate(eventPayload?: BaileysEventMap['contacts.update']) {
    if (!eventPayload) return
    const contacts = await this.saveContacts(eventPayload)
    this.logBatchConflicts('contacts.update', { contacts })
    this.forwardEvent({
      event: 'contacts.update',
      payload: eventPayload,
    })
  }

  private async onCredsUpdate(eventPayload?: BaileysEventMap['creds.update']) {
    if (!eventPayload) return
    await this.authStateCacheManager?.saveCreds()
  }

  private lookupPhone: LookupPhone = async (lid) => {
    try {
      return (await this.client?.signalRepository.lidMapping.getPNForLID(lid)) ?? null
    } catch (error) {
      logger.error({ err: error, sessionId: this.id, msg: 'Contact phone lookup failed' })
      return null
    }
  }

  private async saveContacts(contacts: Partial<Contact>[], lookup = this.lookupPhone) {
    const resolved: Partial<Contact>[] = []
    for (const contact of contacts) {
      try {
        resolved.push(await resolveContactPhone(contact, lookup))
      } catch (error) {
        if (!isContactIdentityConflict(error)) throw error
        // Let the existing store report this payload's identity conflict.
        resolved.push(contact)
      }
    }
    return storeContacts(this.id, resolved)
  }

  private async onLidMapping(mapping?: BaileysEventMap['lid-mapping.update']) {
    if (!mapping) return
    const { lid, phoneNumber } = contactIdentifiers([mapping.lid, mapping.pn])
    if (!(lid && phoneNumber)) return
    await this.enrichPhones(async () => `${phoneNumber}@s.whatsapp.net`, [lid])
  }

  private async enrichPhones(lookup: LookupPhone, lids: string[]) {
    try {
      await enrichContactPhones(this.id, lookup, lids)
    } catch (error) {
      logger.error({ err: error, sessionId: this.id, msg: 'Contact phone enrichment failed' })
    }
  }

  private async onMessagesDelete(eventPayload?: BaileysEventMap['messages.delete']) {
    if (!eventPayload) return
    if ('keys' in eventPayload) {
      for (const key of eventPayload.keys) await updateChatMessage(this.id, key, { deleted: true })
    } else await deleteChatMessages(this.id, eventPayload.jid)
    this.forwardEvent({
      event: 'messages.delete',
      payload: eventPayload,
    })
  }

  private async onMessagesUpdate(eventPayload?: BaileysEventMap['messages.update']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'messages.update',
      payload: normalizeMessageUpdates(eventPayload, this.jid),
    })
    for (const { key, update } of eventPayload)
      await updateChatMessage(this.id, key, update, this.jid)
  }

  private async onMessagesMediaUpdate(eventPayload?: BaileysEventMap['messages.media-update']) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'messages.media-update',
      payload: eventPayload,
    })
  }

  private async onMessagesUpsert(eventPayload?: BaileysEventMap['messages.upsert']) {
    if (!eventPayload) return
    const result: ChatBatchResult = { processed: 0, conflicts: 0 }
    for (const message of eventPayload.messages) {
      let record: Awaited<ReturnType<typeof storeChatMessage>> | undefined
      try {
        record = await this.saveMessage(
          message,
          eventPayload.type === 'notify' ? 'live' : 'history',
        )
      } catch (error) {
        if (!isContactIdentityConflict(error)) throw error
        result.conflicts++
        if (eventPayload.type !== 'notify') this.historySync.markFailed()
        continue
      }
      const webhookEventPayload = {
        message: webhookMessage(
          await normalizeWhatsappMessageWithThumbnails(this.id, message, this.jid),
          record,
        ),
      }
      // We purposefully don't forward messages.upsert in favor of
      // inbound-message.upsert and outbound-message.upsert
      // this.forwardEvent('messages.upsert', webhookEventPayload, loggedEvent)
      const eventKey = message.key.fromMe ? 'outbound-message.upsert' : 'inbound-message.upsert'
      this.forwardEvent({
        event: eventKey,
        payload: webhookEventPayload,
      })
      result.processed++
    }
    this.logBatchConflicts('messages.upsert', { messages: result })
  }

  private async onMessagesReaction(eventPayload?: BaileysEventMap['messages.reaction']) {
    if (!eventPayload) return
    for (const { key, reaction } of eventPayload) {
      const normalized = normalizeMessageReactions([{ key, reaction }], this.jid).reactions[0]
      if (normalized?.sender.id)
        await storeChatReaction(this.id, key, {
          senderJid: normalized.sender.id,
          fromMe: normalized.sender.fromMe,
          emoji: normalized.emoji,
          timestamp: normalized.timestamp,
        })
    }
    this.forwardEvent({
      event: 'messages.reaction',
      payload: normalizeMessageReactions(eventPayload, this.jid),
    })
  }

  private async onMessagingHistorySet(
    eventPayload: BaileysEventMap['messaging-history.set'] | undefined,
  ) {
    if (!eventPayload) return
    this.forwardEvent({
      event: 'messaging-history.set',
      payload: eventPayload,
    })
    await this.historySync.enqueue(
      async () => {
        // Collect every explicit pair before creating identities from this batch.
        const pairs = new Map<string, string>()
        const remember = (jids: readonly (string | null | undefined)[]) => {
          try {
            const { lid, phoneNumber } = contactIdentifiers(jids)
            if (lid && phoneNumber) {
              const pn = `${phoneNumber}@s.whatsapp.net`
              contactIdentifiers([pairs.get(lid), pn])
              pairs.set(lid, pn)
            }
          } catch (error) {
            logger.error({
              err: error,
              sessionId: this.id,
              msg: 'Invalid history identity mapping',
            })
          }
        }
        for (const pair of eventPayload.lidPnMappings ?? []) remember([pair.lid, pair.pn])
        for (const contact of eventPayload.contacts)
          remember([contact.id, contact.lid, contact.phoneNumber])
        for (const message of eventPayload.messages) {
          try {
            remember(messageContactIdentifiers(message.key ?? {}))
          } catch (error) {
            logger.error({
              err: error,
              sessionId: this.id,
              msg: 'Invalid history message identity',
            })
          }
        }
        const lookup: LookupPhone = async (lid) =>
          pairs.get(jidNormalizedUser(lid)) ?? this.lookupPhone(lid)
        const contacts = await this.saveContacts(
          [
            ...eventPayload.contacts,
            ...[...pairs].map(([lid, phoneNumber]) => ({ id: lid, phoneNumber })),
          ],
          lookup,
        )
        this.historySync.advance('contacts', contacts.processed)
        if (contacts.conflicts) this.historySync.markFailed()
        const conversations = await storeChatSummaries(this.id, eventPayload.chats)
        this.historySync.advance('conversations', conversations.processed)
        if (conversations.conflicts) this.historySync.markFailed()
        const messages = await this.saveMessageBulk(eventPayload.messages, lookup)
        this.logBatchConflicts('messaging-history.set', { contacts, conversations, messages })
        if (pairs.size) await this.enrichPhones(lookup, [...pairs.keys()])
      },
      eventPayload.syncType === proto.HistorySync.HistorySyncType.FULL &&
        eventPayload.progress === 100,
    )
  }

  private async onMessageReceiptUpdate(eventPayload?: BaileysEventMap['message-receipt.update']) {
    if (!eventPayload) return
    const normalized = normalizeMessageReceipts(eventPayload)
    for (const [index, { key }] of eventPayload.entries()) {
      const receipt = normalized.receipts[index]
      await updateChatMessage(this.id, key, {
        status: receipt.playedAt ? 5 : receipt.readAt ? 4 : receipt.deliveredAt ? 3 : undefined,
      })
    }
    logger.info(`Event: message-receipt.update, session: ${this._id}`)
    this.forwardEvent({
      event: 'message-receipt.update',
      payload: normalized,
    })
  }

  private async onGroupsUpsert(eventPayload?: BaileysEventMap['groups.upsert']) {
    if (!eventPayload) return
    logger.info(`Event: groups.upsert, session: ${this._id}`)
    this.forwardEvent({
      event: 'groups.upsert',
      payload: eventPayload,
    })
  }

  private async onGroupsUpdate(eventPayload?: BaileysEventMap['groups.update']) {
    if (!eventPayload) return
    logger.info(`Event: groups.update, session: ${this._id}`)
    this.forwardEvent({
      event: 'groups.update',
      payload: eventPayload,
    })
  }

  private async onGroupParticipantsUpdate(
    eventPayload?: BaileysEventMap['group-participants.update'],
  ) {
    if (!eventPayload) return
    logger.info(`Event: group-participants.update, session: ${this._id}`)
    this.forwardEvent({
      event: 'group-participants.update',
      payload: eventPayload,
    })
  }

  private async onBlocklistSet(eventPayload?: BaileysEventMap['blocklist.set']) {
    if (!eventPayload) return
    logger.info(`Event: blocklist.set, session: ${this._id}`)
    this.forwardEvent({
      event: 'blocklist.set',
      payload: eventPayload,
    })
  }

  private async onBlocklistUpdate(eventPayload?: BaileysEventMap['blocklist.update']) {
    if (!eventPayload) return
    logger.info(`Event: blocklist.update, session: ${this._id}`)
    this.forwardEvent({
      event: 'blocklist.update',
      payload: eventPayload,
    })
  }

  // Collect and resolve the user's own JIDs (normal jid and alternate @lid)
  private resolveOwnJids(): {
    jid: string | null
    jidAlt: string | null
    all: string[]
  } {
    const candidates = new Set<string>()
    const user = this.client?.user as ContactWithJid | null

    const add = (value?: unknown) => {
      if (!value) return
      if (typeof value === 'string') candidates.add(value)
      if (typeof value === 'object') {
        const { jid } = value as ContactWithJid
        if (jid && typeof jid === 'string') candidates.add(jid)
      }
    }

    // Do socket
    add(user?.id)
    add(user?.jid)

    // From persisted credentials
    const me = this.authStateCacheManager?.state?.creds?.me as ContactWithJid | undefined
    add(me?.id)
    add(me?.jid)
    add(me?.lid) // may be a string or an object with .jid in some versions

    // Normalize all to remove device suffix and convert LID -> user
    const normalized = Array.from(candidates).map((j) => {
      try {
        return jidNormalizedUser(j)
      } catch {
        return j
      }
    })

    const all = normalized
    const lidJid = all.find((j) => j.includes('@lid')) ?? null

    // Prefer "user" jid (@s.whatsapp.net)
    const userJid = all.find((j) => j.endsWith('@s.whatsapp.net')) ?? all[0] ?? null

    return { jid: userJid, jidAlt: lidJid, all }
  }

  private async onConnectionUpdate(
    connectionUpdateEvent: BaileysEventMap['connection.update'] | undefined,
  ) {
    if (!connectionUpdateEvent) return
    this.forwardEvent({
      event: 'connection.update',
      payload: connectionUpdateEvent,
    })

    const { qr, lastDisconnect } = connectionUpdateEvent

    if (qr) {
      logger.info(`QR Code received, sessionId: ${this._id}`)
      await this.handleQRCodeReceived(this._id, qr)
      if (!this.client) return
    }

    const { connection: conn } = connectionUpdateEvent ?? {}

    const loggedOut =
      (lastDisconnect?.error as Boom | undefined)?.output?.statusCode === DisconnectReason.loggedOut
    if (conn && (conn !== this._status || (conn === 'close' && loggedOut))) {
      this._status = conn as WAConnectionState

      if (conn === 'open') {
        const { jid, jidAlt } = this.resolveOwnJids()
        this.jid = jid
        this._jidAlt = jidAlt

        await this.updatePersistentSessionData({
          status: conn,
          connectedAt: new Date(),
          disconnectedAt: null,
          ...(jid ? { jid } : {}),
        })
        await this.refreshProfilePicture()
        return
      }

      if (conn === 'close') {
        await this.handleConnectionClosed(this._id, lastDisconnect)
        return
      }

      await this.updatePersistentSessionData({
        status: conn,
      })
    }
  }

  private async handleQRCodeReceived(sessionId: string, qr: string) {
    const qrCodeOptions: QRCodeToDataURLOptions = {
      margin: 3,
      scale: 4,
      errorCorrectionLevel: 'H',
      color: { light: '#ffffff', dark: '#000000' },
    }

    qrcode.toDataURL(qr, qrCodeOptions, (error, base64QRCode) => {
      if (error) {
        logger.error({
          msg: 'Error generating QR code for session',
          extra: {
            source: 'WhatsappService',
            function: 'handleQRCodeReceived',
            sessionId,
            error: error instanceof Error ? error.message : error,
            stack: (error as Error)?.stack,
          },
        })
        return
      }
      this._qrCode = qr
      this._qrCodeBase64 = cleanBase64String(base64QRCode)
      if (!this.markedForDeletion)
        publishAppInvalidation({
          resource: 'sessions',
          sessionId,
          ownerId: this._userId,
          origin: null,
        })
    })

    if (this._qrRetries >= QR_MAX_RETRIES) {
      logger.info(`QR Code retries exceeded, sessionId: ${sessionId}`)
      this.resetQrRetries()
      const client = this.client
      this.client = null
      client?.ws.close()
      this._status = 'close'
      await this.updatePersistentSessionData({ status: 'close', disconnectedAt: new Date() })
    } else {
      this.incrementQrRetries()
    }
  }

  private async handleConnectionClosed(
    sessionId: string,
    lastDisconnect?: { error: Error | undefined; date: Date },
  ) {
    if (this.markedForDeletion || this.logoutTask) return
    const errorStatusCode = (lastDisconnect?.error as Boom)?.output?.statusCode || 0
    if (errorStatusCode === DisconnectReason.loggedOut) {
      await this.logout(true)
      return
    }
    const preventReconnectCodes = [402, 406, DisconnectReason.forbidden]
    if (preventReconnectCodes.includes(errorStatusCode)) {
      await this.updatePersistentSessionData({
        status: 'close',
        jid: null,
        connectedAt: null,
        disconnectedAt: new Date(),
      })
      await this.clearCache()
      logger.warn(`Connection closed, sessionId: ${sessionId}, errorStatusCode: ${errorStatusCode}`)
    } else {
      logger.info(
        `Reconnecting after closing, sessionId: ${sessionId}, errorStatusCode: ${errorStatusCode}`,
      )
      await this.updatePersistentSessionData({ status: 'close', disconnectedAt: new Date() })
      this.createClient()
    }
  }

  private async updatePersistentSessionData(data: Prisma.WaSessionUpdateInput) {
    if (!this.markedForDeletion) {
      await prisma.waSession.update({
        where: {
          id: this.id,
        },
        data,
      })
      publishAppInvalidation({
        resource: 'sessions',
        sessionId: this.id,
        ownerId: this._userId,
        origin: null,
      })
    }
  }

  private async clearCache() {
    this.userDevicesCache.flushAll()
    this.msgRetryCounterCache.flushAll()
    await this.authStateCacheManager?.clearAllData()
  }

  private async saveMessage(
    message: WAProto.WebMessageInfo | WAProto.IWebMessageInfo | undefined,
    source: 'live' | 'history' | 'send' = 'send',
    clientRequestId?: string,
    lookup = this.lookupPhone,
  ) {
    if (!message?.key?.id) {
      logger.warn({
        source: 'WhatsappService',
        function: 'saveMessage',
        sessionId: this.id,
        msg: 'Could not save message due to missing key.id',
        time: Date.now(),
      })
      return
    }

    const key = await resolveMessagePhone(message.key, lookup)
    return storeChatMessage(this.id, { ...message, key }, source, this.jid, clientRequestId)
  }

  private async saveMessageBulk(
    messages: WAProto.WebMessageInfo[] | WAProto.IWebMessageInfo[],
    lookup = this.lookupPhone,
  ): Promise<ChatBatchResult> {
    const result: ChatBatchResult = { processed: 0, conflicts: 0 }
    for (const message of messages) {
      try {
        await this.saveMessage(message, 'history', undefined, lookup)
      } catch (error) {
        if (!isContactIdentityConflict(error)) throw error
        result.conflicts++
        this.historySync.markFailed()
        continue
      }
      result.processed++
      this.historySync.advance('messages')
    }
    return result
  }

  private getMessage = async ({ id, remoteJid }: WAProto.IMessageKey) => {
    try {
      if (id) {
        const retrievedMessage = await findLegacyMessage(this.id, id, remoteJid)
        if (retrievedMessage) {
          const rawContent = retrievedMessage.rawContent as unknown as
            | WAProto.WebMessageInfo
            | WAProto.IWebMessageInfo
          return rawContent.message ?? undefined
        }
      }
    } catch (error) {
      logger.warn({
        source: 'WhatsappService',
        function: 'getMessage',
        sessionId: this.id,
        msg: 'Error retrieving message from the database',
        time: Date.now(),
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private async getRawMessage({ id, remoteJid }: WAProto.IMessageKey) {
    try {
      if (id) {
        const retrievedMessage = await findLegacyMessage(this.id, id, remoteJid)
        if (retrievedMessage) {
          return retrievedMessage.rawContent as unknown as WAMessage
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('AMBIGUOUS_MESSAGE_ID')) throw error
      logger.warn({
        source: 'WhatsappService',
        function: 'getRawMessage',
        sessionId: this.id,
        msg: 'Error retrieving message from the database',
        time: Date.now(),
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  private isMediaMessage(messageInfo: WAProto.IWebMessageInfo) {
    const message = interactiveContent(messageInfo.message)
    return (
      message?.imageMessage ||
      message?.videoMessage ||
      message?.audioMessage ||
      message?.stickerMessage ||
      message?.documentMessage
    )
  }

  /**
   * Downloads the media of a message as bytes.
   */
  public async getMessageMedia(message: WAProto.IWebMessageInfo) {
    return await this.downloadMessageMedia(message)
  }

  private async downloadMessageMedia(message: WAProto.IWebMessageInfo) {
    let media = null
    if (this.client && this.isMediaMessage(message) && message.key) {
      try {
        media = await downloadWhatsappMedia(
          { key: message.key, message: interactiveContent(message.message) },
          this.client.updateMediaMessage,
        )
      } catch (error) {
        if (error instanceof RateLimitedError) throw error
        logger.debug({
          msg: 'Error fetching media message',
          extra: {
            source: 'whatsapp-session',
            function: 'getMessageMedia',
            sessionId: this.id,
            messageId: message.key.id,
            httpStatus: error instanceof Boom ? error.output.statusCode : undefined,
            error:
              error instanceof Error
                ? error.message.replace(/https?:\/\/\S+/g, '[media URL]')
                : String(error),
          },
        })
      }
    }
    return media
  }

  public markForDeletion() {
    this.markedForDeletion = true
  }

  public async prepareForDeletion() {
    this.markForDeletion()
    try {
      if (this.client && this.status !== 'close') await this.client.logout()
    } catch (error) {
      logger.warn({
        err: error,
        sessionId: this.id,
        msg: 'Remote logout failed during session deletion',
      })
    } finally {
      this.disconnect()
      this.client = null
    }
    await Promise.all(this.pendingEvents)
    await this.clearCache()
  }

  public async logout(remote = false) {
    if (this.logoutTask) return this.logoutTask
    this.logoutTask = this.completeLogout(remote)
    try {
      await this.logoutTask
    } finally {
      this.logoutTask = null
    }
  }

  private async completeLogout(remote: boolean) {
    const client = this.client
    if (!remote) await client?.logout(`Logout instance: ${this.id}`)
    this.client = null
    client?.ws.close()
    this._status = 'close'
    this._profilePictureUrl = null
    await this.updatePersistentSessionData({
      status: 'close',
      jid: null,
      profilePictureUrl: null,
      connectedAt: null,
      disconnectedAt: new Date(),
    })
    await Promise.all(this.pendingEvents)
    await this.clearCache()
    await clearSessionMessages(this.id)
  }

  public disconnect() {
    this.client?.ws.close()
  }

  public async createMediaMessage(message: MediaMessage): Promise<AnyMediaMessageContent> {
    const { media, caption } = message
    const { type, source, fileName, gifPlayback } = media

    if (!(isUrl(source) || isBase64(source))) {
      throw new InvalidMediaError('Invalid media source, must be a URL or base64 string')
    }

    const mimeTypeResult = isUrl(source)
      ? await getMimeTypeFromUrl(source)
      : await getMimeTypeFromBase64(source, fileName)

    if (!mimeTypeResult?.mimeType) {
      throw new InvalidMediaError('Could not determine mimetype from the provided source')
    }

    const baseMessageConfig = {
      gifPlayback,
      ...(caption && { caption }),
      mimetype: mimeTypeResult.mimeType,
      fileName: getFileName(fileName, mimeTypeResult.mimeType),
    }

    const mediaPayload = mimeTypeResult.buffer

    switch (type) {
      case 'document':
        return {
          document: mediaPayload,
          ...baseMessageConfig,
        }
      case 'video':
        return {
          video: mediaPayload,
          ...baseMessageConfig,
        }
      case 'audio':
        return {
          audio: mediaPayload,
          ptt: Boolean((message as unknown as AudioMessage).asVoiceNote),
          ...baseMessageConfig,
        }
      default:
        return {
          image: mediaPayload,
          ...baseMessageConfig,
        }
    }
  }

  public async subscribePresence(jid: string): Promise<boolean> {
    if (!this.enabled || this.status !== 'open' || !this.client) return false
    await this.client.presenceSubscribe(jid)
    return true
  }

  public async sendMessage(
    jid: string,
    message: AnyMessageContent | AnyMediaMessageContent,
    type: MessageType,
    options: {
      clientRequestId?: string
      delay?: number
      quoted?: string
      presenceType?: WAPresence
    },
  ) {
    if (options.delay) {
      await this.client?.presenceSubscribe(jid)
      await sleep(500)
      await this.client?.sendPresenceUpdate(options.presenceType ?? 'composing', jid)
      await sleep(options.delay)
      await this.client?.sendPresenceUpdate('paused', jid)
    }

    if ('text' in message && message.linkPreview === undefined) {
      const url = message.text.match(/https?:\/\/[^\s]+/i)?.[0]
      // null prevents Baileys from falling back to its unrestricted downloader.
      message = {
        ...message,
        linkPreview: (url ? await outboundLinkPreview(url) : undefined) ?? null,
      }
    }
    const sentMessage = await this.client?.sendMessage(jid, message, {
      quoted: await this.getRawMessage({ id: options.quoted, remoteJid: jid }),
    })

    const record = await this.saveMessage(sentMessage, 'send', options.clientRequestId)
    if (sentMessage) {
      this.forwardEvent({
        event: 'messages.send',
        payload: {
          message: webhookMessage(
            await normalizeWhatsappMessageWithThumbnails(this.id, sentMessage, this.jid),
            record,
          ),
        },
      })
    }
    await this.registerSendMessage(jid, type)

    return sentMessage
  }

  public async getMessageMediaById(messageId: string, remoteJid?: string) {
    const rawMessage = await this.getRawMessage({ id: messageId, remoteJid })
    if (!rawMessage) return null
    return this.getMessageMedia(rawMessage as WAProto.IWebMessageInfo)
  }

  public async resendWebhookEvent({
    url,
    parentLogId,
    event,
    payload,
    messageId,
    webhookId,
  }: {
    url: string
    parentLogId: string
    event: keyof typeof WebhookEventsSchema.shape
    payload: Record<string, unknown>
    messageId: string | null
    webhookId: string
  }) {
    const reconstructed: Record<string, unknown> = { ...payload }
    // Legacy logs used base64Media; new events use authenticated download paths.
    // Replay the stored contract rather than normalizing an event a second time.
    if (messageId && Object.hasOwn(reconstructed, 'base64Media')) {
      const base64Media = await this.getMessageMediaById(messageId)
      reconstructed.base64Media = base64Media?.toString('base64') ?? null
    }
    return this.forwardEvent({
      url,
      parentLogId,
      event,
      payload: reconstructed,
      resend: true,
      webhookId,
    })
  }

  private async fetchProfilePictureUrl(
    client: AwaitedWASocket,
    jid: string,
  ): Promise<string | null> {
    try {
      return (await client.profilePictureUrl(jid, 'image')) ?? null
    } catch (error) {
      if (isBoom(error) && error.output.statusCode === 404) return null
      throw error
    }
  }

  public async refreshProfilePicture() {
    const client = this.client
    const jid = this.jid
    if (!client || !jid || this.status !== 'open' || this.markedForDeletion || this.logoutTask)
      return
    try {
      const profilePictureUrl = await this.fetchProfilePictureUrl(client, jid)
      if (
        client !== this.client ||
        this.status !== 'open' ||
        jid !== this.jid ||
        this.markedForDeletion ||
        this.logoutTask
      )
        return
      const updated = await prisma.waSession.updateMany({
        where: {
          id: this.id,
          status: 'open',
          enabled: true,
          archived: false,
          ...(profilePictureUrl === null
            ? { profilePictureUrl: { not: null } }
            : {
                OR: [
                  { profilePictureUrl: null },
                  { profilePictureUrl: { not: profilePictureUrl } },
                ],
              }),
        },
        data: { profilePictureUrl },
      })
      this._profilePictureUrl = profilePictureUrl
      if (updated.count)
        publishAppInvalidation({
          resource: 'sessions',
          sessionId: this.id,
          ownerId: this._userId,
          origin: null,
        })
    } catch (error) {
      logger.error({
        err: error,
        sessionId: this.id,
        msg: 'Failed to refresh session profile picture',
      })
    }
  }

  public async getContactProfilePictureUrl(jid: string) {
    const client = this.client
    if (!client || this.status !== 'open' || this.markedForDeletion || this.logoutTask)
      throw new Error('WhatsApp session is disconnected')
    const url = await this.fetchProfilePictureUrl(client, jid)
    if (
      client !== this.client ||
      this.status !== 'open' ||
      this.markedForDeletion ||
      this.logoutTask
    )
      throw new Error('WhatsApp session changed during profile picture lookup')
    return url
  }

  public async getDisplayPicture(jid: string) {
    if (!this.client) return null

    const url = await this.client.profilePictureUrl(jid, 'image')

    if (!url) {
      logger.warn(`Failed to get display picture for jid: ${jid}, sessionId: ${this.id}`)
      return null
    }

    const response = await axiosInstance.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(response.data)
    const base64 = buffer.toString('base64')

    return {
      url,
      base64,
    }
  }

  public async updateDisplayPicture(jid: string, source: string) {
    if (!this.client) return null

    if (!(isUrl(source) || isBase64(source))) {
      throw new InvalidMediaError('Invalid media source, must be a URL or base64 string')
    }

    let imagePayload: Buffer
    if (isUrl(source)) {
      const image = await axiosInstance({
        url: source,
        method: 'get',
        responseType: 'arraybuffer',
      })
      imagePayload = Buffer.from(image.data, 'binary')
    } else {
      imagePayload = getBase64Buffer(source)
    }

    try {
      await this.client.updateProfilePicture(jid, imagePayload)
    } catch (error) {
      if (error instanceof Boom && error.data === 401) {
        throw new AccessDeniedError(
          'Access denied to update display picture. If you are updating a group, make sure you are an admin and the group exists.',
        )
      }
    }
  }

  public async updateProfileName(name: string) {
    if (!this.client) return null
    await this.client.updateProfileName(name)
  }

  public async updateProfileStatus(status: string) {
    if (!this.client) return null
    await this.client.updateProfileStatus(status)
  }

  public async isOnWhatsApp(jid: string) {
    if (!this.client) return null

    return this.client.onWhatsApp(jid)
  }

  public async fetchStatus(jid: string) {
    if (!this.client) return null

    return this.client.fetchStatus(jid)
  }

  public async createGroup(subject: string, participants: string[]) {
    if (!this.client) return null

    const result = await this.client.groupCreate(subject, participants)
    logger.info({
      msg: `Created group ${result.id}, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: result.id,
    })
    return result
  }

  public async updateGroupSubject(jid: string, subject: string) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    await this.client.groupUpdateSubject(jid, subject)
    logger.info({
      msg: `Updated group ${jid} subject, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
  }

  public async updateGroupDescription(jid: string, description: string) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    await this.client.groupUpdateDescription(jid, description)
    logger.info({
      msg: `Updated group ${jid} description, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
  }

  public async setOnlyAdminsCanPost(jid: string, onlyAdminsCanPost: boolean) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    await this.client.groupSettingUpdate(
      jid,
      onlyAdminsCanPost ? 'announcement' : 'not_announcement',
    )
    logger.info({
      msg: `Updated group ${jid} onlyAdminsCanPost to ${onlyAdminsCanPost}, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
  }

  public async setOnlyAdminsCanEditInfo(jid: string, onlyAdminsCanEditInfo: boolean) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    await this.client.groupSettingUpdate(jid, onlyAdminsCanEditInfo ? 'locked' : 'unlocked')
    logger.info({
      msg: `Updated group ${jid} onlyAdminsCanEditInfo to ${onlyAdminsCanEditInfo}, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
  }

  public async updateGroupParticipants(
    jid: string,
    participants: string[],
    action: ParticipantAction,
  ) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    const result = await this.client.groupParticipantsUpdate(jid, participants, action)
    logger.info({
      msg: `Updated group ${jid} participants, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
    return result
  }

  public async leaveGroup(jid: string) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    await this.client.groupLeave(jid)
    logger.info({
      msg: `Left group ${jid}, sessionId: ${this.id}`,
      sessionId: this.id,
      groupId: jid,
    })
  }

  public async getGroupInviteCode(jid: string) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    return await this.client.groupInviteCode(jid)
  }

  public async revokeGroupInviteCode(jid: string) {
    if (!this.client) return null

    if (!isJidGroup(jid)) {
      throw new InvalidJidError('Jid must be a group')
    }

    return this.client.groupRevokeInvite(jid)
  }

  public async listGroups() {
    if (!this.client) return null
    return this.client.groupFetchAllParticipating()
  }

  public setConfig(config: CreateWASessionConfig) {
    this.config = config
  }

  public signTextMessage(text: string, options?: TextSignature) {
    return signTextMessage(text, this.config, options)
  }

  public async blockContact(jid: string) {
    if (!this.client) return null

    return this.client.updateBlockStatus(jid, 'block')
  }

  public async unblockContact(jid: string) {
    if (!this.client) return null

    return this.client.updateBlockStatus(jid, 'unblock')
  }

  // Privacy

  public async getPrivacySettings() {
    if (!this.client) return null
    return this.client.fetchPrivacySettings(true)
  }

  public async updateLastSeenPrivacy(privacy: WAPrivacyValue) {
    if (!this.client) return null
    return this.client.updateLastSeenPrivacy(privacy)
  }

  public async updateOnlinePrivacy(privacy: WAPrivacyOnlineValue) {
    if (!this.client) return null
    return this.client.updateOnlinePrivacy(privacy)
  }

  public async updateProfilePicturePrivacy(privacy: WAPrivacyValue) {
    if (!this.client) return null
    return this.client.updateProfilePicturePrivacy(privacy)
  }

  public async updateStatusPrivacy(privacy: WAPrivacyValue) {
    if (!this.client) return null
    return this.client.updateStatusPrivacy(privacy)
  }

  public async updateReadReceiptsPrivacy(privacy: WAReadReceiptsValue) {
    if (!this.client) return null
    return this.client.updateReadReceiptsPrivacy(privacy)
  }

  public async updateGroupsAddPrivacy(privacy: WAPrivacyGroupAddValue) {
    if (!this.client) return null
    return this.client.updateGroupsAddPrivacy(privacy)
  }

  public async updateDefaultDisappearingMode(mode: keyof typeof DefaultDisappearingMode) {
    if (!this.client) return null
    return this.client.updateDefaultDisappearingMode(DefaultDisappearingMode[mode])
  }

  public async editTextMessage(key: import('baileys').WAMessageKey, text: string) {
    if (!this.client || !key.remoteJid) return null
    const original = await this.getRawMessage(key)
    if (!original?.key.remoteJid) return null
    return this.client.sendMessage(original.key.remoteJid, { text, edit: original.key })
  }

  public async deleteMessageForEveryOne(id: string, key?: import('baileys').WAMessageKey) {
    if (!this.client) return null
    try {
      const msg = key ? { key } : await this.getRawMessage({ id })
      if (!msg?.key?.remoteJid) {
        logger.warn({
          source: 'WhatsappService',
          function: 'deleteMessage',
          sessionId: this.id,
          msg: `Could not delete message ${id} because it was not found`,
          time: Date.now(),
        })
        return null
      }
      return this.client.sendMessage(msg.key.remoteJid, { delete: msg.key })
    } catch (error) {
      logger.warn({
        source: 'WhatsappService',
        function: 'deleteMessage',
        sessionId: this.id,
        msg: `Could not delete message ${id} because it was not found`,
        time: Date.now(),
        error: error instanceof Error ? error.message : error,
      })
      return null
    }
  }
}
