import { prisma } from '@db/prisma'
import type { GlobalWebhook } from '@generated/prisma'
import { MessageType } from '@generated/prisma'
import { JidCreator } from '@lib/jid-creator'
import { logger } from '@lib/logger'
import { getLocationFromAddress, getMimeTypeFromBase64, waitUntil } from '@lib/utils'
import { createVcard } from '@lib/vcard'
import { WhatsappSession } from '@lib/whatsapp-session'
import { BadRequestError } from '@server/common/errors/bad-request-error.ts'
import {
  type AudioMessage,
  type ContactMessage,
  type CreateGroupBody,
  type CreateWASessionConfig,
  type DefaultDisappearingMode,
  type DocumentMessage,
  type ImageMessage,
  type LocationMessage,
  type TextMessage,
  type TextSignature,
  type UpdateWASessionConfig,
  type VideoMessage,
  type WAPrivacyOnlineValue,
  type WAPrivacyValue,
  type WAReadReceiptsValue,
  type WebhookEvents,
  WebhookEventsSchema,
} from '@server/common/schema'
import { InvalidLocationError, InvalidSessionError, SessionNotFoundError } from '@services/errors'
import type {
  AnyMessageContent,
  BaileysEventMap,
  ParticipantAction,
  WAPrivacyGroupAddValue,
  WAProto,
} from 'baileys'
import { RateLimitedError } from '../common/errors/rate-limited-error.ts'
import { publishAppInvalidation } from '../lib/app-events.ts'
import axios from '../lib/axios-instance.ts'
import { publishChatChange } from '../lib/chat-events.ts'
import { findLegacyMessage } from '../lib/chat-store.ts'

class WhatsappService {
  private sessionMap: Map<string, WhatsappSession> = new Map()
  private static instance: WhatsappService
  private globalWebhooks: GlobalWebhook[] = []

  private forwardToGlobalWebhooks = async (
    session: {
      id: string
      jid: string | null | undefined
      status: string | undefined
    },
    event: keyof typeof WebhookEventsSchema.shape,
    payload?: unknown,
  ) => {
    for (const webhook of this.globalWebhooks) {
      const events = webhook.events as WebhookEvents
      const headers = webhook.headers as Record<string, string>
      if (webhook.enabled && events[event]) {
        try {
          const response = await axios({
            maxContentLength: 64 * 1024,
            method: 'POST',
            url: webhook.url,
            data: {
              event,
              session,
              payload,
            },
            headers: {
              'Content-Type': 'application/json',
              ...(headers || {}),
            },
          })
          if (response.status !== 200) {
            throw new Error(`status: ${response.status}`)
          }
          logger.info({
            msg: `Forwarded event: ${event}, global webhook: ${webhook.id}`,
            sessionId: session.id,
            sessionStatus: session.status,
            webhookId: webhook.id,
            webhookUrl: webhook.url,
          })
        } catch (error) {
          logger.warn({
            msg: `Error forwarding event: ${event}, global webhook: ${webhook.id}`,
            sessionId: session.id,
            sessionStatus: session.status,
            webhookId: webhook.id,
            webhookUrl: webhook.url,
            error: error instanceof Error ? error.message : error,
          })
        }
      }
    }
  }

  public getChatSyncState(sessionId: string) {
    return (
      this.sessionMap.get(sessionId)?.syncState ?? {
        syncStatus: 'idle' as const,
      }
    )
  }

  public acknowledgeHistorySyncError(sessionId: string, errorId: string) {
    this.sessionMap.get(sessionId)?.acknowledgeHistorySyncError(errorId)
  }

  public async subscribeConversationPresence(sessionId: string, conversationId: string) {
    const session = this.sessionMap.get(sessionId)
    if (!session) return false
    const conversation = await prisma.waConversation.findFirst({
      where: { sessionId, id: conversationId, isGroup: false },
      select: { jid: true },
    })
    if (!conversation) return false
    return session.subscribePresence(conversation.jid)
  }

  public getSessionQrCode(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    return session?.status === 'connecting' ? session.qrCodeBase64 : null
  }

  private processSessionEvent = async (
    sessionId: string,
    event: keyof typeof WebhookEventsSchema.shape,
    payload: unknown,
  ) => {
    const session = this.sessionMap.get(sessionId)
    const isConnUpdate = event === 'connection.update'
    let status = session?.status

    if (isConnUpdate) {
      const { connection } = payload as BaileysEventMap['connection.update']
      publishChatChange({
        sessionId,
        state: {
          connected: connection === 'open',
          enabled: this.isSessionEnabled(sessionId),
          ...this.getChatSyncState(sessionId),
        },
      })
      if (!connection || connection === 'connecting') return
      status = connection
    }

    if (status === 'open') {
      await waitUntil({
        topic: 'sessionJidReady',
        condition: () => Boolean(session?.jid),
        callback: async () => {
          this.forwardToGlobalWebhooks(
            {
              id: sessionId,
              jid: session?.jid as string,
              status,
            },
            event,
            isConnUpdate ? undefined : payload,
          )
        },
        timeout: 5_000,
        interval: 500,
      })
    } else {
      this.forwardToGlobalWebhooks(
        {
          id: sessionId,
          jid: session?.jid,
          status,
        },
        event,
        isConnUpdate ? undefined : payload,
      )
    }
  }

  private async getDefaultDisplayName(userId: string | null) {
    if (!userId) return 'session_1'
    const sessionCount = await prisma.waSession.count({
      where: {
        userId,
      },
    })
    return `session_${sessionCount + 1}`
  }

  public static getInstance(): WhatsappService {
    if (!WhatsappService.instance) {
      WhatsappService.instance = new WhatsappService()
      WhatsappService.instance.loadGlobalWebhooks()
    }
    return WhatsappService.instance
  }

  public async loadSession({
    id,
    enabled,
    displayName,
    userId,
    sessionConfig,
    jid,
  }: {
    id: string
    enabled: boolean
    displayName: string
    userId: string | null
    sessionConfig: CreateWASessionConfig
    jid?: string | null
  }): Promise<WhatsappSession> {
    const session = new WhatsappSession(id, enabled, sessionConfig, displayName, userId)
    session.jid = jid ?? null
    // We don't want to waste memory on disabled sessions
    if (session.enabled) {
      this.sessionMap.set(id, session)
      session.onEventForwarded = this.processSessionEvent
      await this.loadWebhooks(id)
    }
    return session
  }

  public async createSession({
    id,
    enabled,
    displayName,
    sessionConfig,
    userId,
  }: {
    id: string
    enabled: boolean
    displayName: string | undefined
    sessionConfig: CreateWASessionConfig
    userId: string
  }) {
    const sessionDisplayName = displayName ?? (await this.getDefaultDisplayName(userId))
    if (sessionConfig.signatureEnabled && !sessionConfig.signatureName.trim())
      throw new BadRequestError('Informe um nome para ativar a assinatura')
    const storedSession = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session-quota:${userId}`}, 0))`
      if ((await tx.waSession.count({ where: { userId } })) >= 20)
        throw new RateLimitedError('Maximum 20 sessions per user')
      return tx.waSession.create({
        data: {
          id,
          userId,
          status: 'close',
          enabled,
          displayName: sessionDisplayName,
          config: {
            create: sessionConfig,
          },
        },
        include: {
          config: true,
        },
      })
    })
    const session = await this.loadSession({
      id,
      enabled,
      userId,
      sessionConfig,
      displayName: sessionDisplayName,
    })
    publishAppInvalidation({ resource: 'sessions', sessionId: id, ownerId: storedSession.userId })
    return { session, storedSession }
  }

  public async updateSession({
    id,
    enabled,
    displayName,
    sessionConfig,
  }: {
    id: string
    enabled?: boolean
    displayName?: string
    sessionConfig?: UpdateWASessionConfig
  }) {
    let sessionFromMap = this.sessionMap.get(id)
    const sessionFromDb = await prisma.waSession.findUnique({
      where: {
        id,
      },
      include: {
        config: true,
      },
    })

    if (!sessionFromDb) {
      throw new SessionNotFoundError()
    }

    const signatureConfig = { ...sessionFromDb.config, ...sessionConfig }
    if (signatureConfig.signatureEnabled && !signatureConfig.signatureName?.trim())
      throw new BadRequestError('Informe um nome para ativar a assinatura')

    const updatedSession = await prisma.waSession.update({
      where: {
        id,
      },
      data: {
        enabled,
        displayName,
        config: {
          update: sessionConfig,
        },
      },
      include: {
        config: true,
      },
    })
    publishAppInvalidation({ resource: 'sessions', sessionId: id, ownerId: updatedSession.userId })

    // If a session is not mapped, it either doesn't exist or is disabled.
    // If it's enabled, we need to load it.
    if (!sessionFromMap && updatedSession.enabled) {
      sessionFromMap = await this.loadSession({
        id,
        enabled: updatedSession.enabled,
        userId: updatedSession.userId,
        displayName:
          updatedSession.displayName ?? (await this.getDefaultDisplayName(updatedSession.userId)),
        sessionConfig: updatedSession.config as CreateWASessionConfig,
        jid: updatedSession.jid,
      })

      // Wait for the session to be ready
      await waitUntil({
        topic: 'sessionReady',
        condition: () => Boolean(sessionFromMap?.qrCodeBase64),
        callback: () => {},
        timeout: 30_000,
        interval: 500,
      })

      // Add the qrCodeBase64 to the updatedSession before returning it
      return {
        ...updatedSession,
        status: sessionFromMap?.status,
        qrCodeBase64: sessionFromMap?.qrCodeBase64,
      }
    }

    // If a session is mapped, and it is not being disabled now, we need to update it
    if (sessionFromMap && updatedSession.enabled) {
      sessionFromMap.enabled = updatedSession.enabled
      sessionFromMap.displayName = updatedSession.displayName ?? sessionFromMap.displayName
      sessionFromMap.setConfig(updatedSession.config as CreateWASessionConfig)
    }

    // If a session is mapped, and it is being disabled now, we need to logout and remove it
    if (sessionFromMap && !updatedSession.enabled) {
      await sessionFromMap.logout()
      this.sessionMap.delete(id)
      updatedSession.status = 'close'
    }

    return updatedSession
  }

  /**
   * Loads all stored WhatsApp sessions from the database and initializes them.
   * This method is typically called when the service starts up to restore
   * previously created sessions. It fetches all sessions with their configs
   * from the database and attempts to load each one. Any errors during the
   * loading process are logged but don't stop the overall loading process.
   */
  public async loadStoredSessions(): Promise<void> {
    try {
      const whatsappSessions = await prisma.waSession.findMany({
        where: {
          archived: false,
        },
        include: {
          config: true,
        },
      })
      await Promise.all(
        whatsappSessions.map(
          async ({ id, enabled, jid, config: sessionConfig, displayName, userId }) =>
            this.loadSession({
              id,
              enabled,
              userId,
              displayName: displayName ?? (await this.getDefaultDisplayName(userId)),
              sessionConfig: sessionConfig as CreateWASessionConfig,
              jid,
            }),
        ),
      )
      logger.info(`Loaded ${whatsappSessions.length} whatsapp session(s)`)
    } catch (error) {
      logger.error({
        msg: 'Error loading sessions',
        stack: (error as Error)?.stack,
        extra: {
          source: 'WhatsappService',
          function: 'loadSessions',
        },
      })
    }
  }

  public async connectSession(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    if (session && session.status === 'connecting') {
      return session
    }

    if (session && session.status === 'open') {
      throw new InvalidSessionError('Session is already connected')
    }

    const retrievedSession = await prisma.waSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        config: true,
      },
    })

    if (!retrievedSession) {
      throw new SessionNotFoundError()
    }

    return this.loadSession({
      id: sessionId,
      enabled: retrievedSession.enabled,
      userId: retrievedSession.userId,
      displayName:
        retrievedSession.displayName ?? (await this.getDefaultDisplayName(retrievedSession.userId)),
      sessionConfig: retrievedSession.config as CreateWASessionConfig,
      jid: retrievedSession.jid,
    })
  }

  public async archiveSession(sessionId: string) {
    const sessionFromDb = await prisma.waSession.findUnique({
      where: {
        id: sessionId,
      },
    })

    if (!sessionFromDb) throw new SessionNotFoundError()

    const session = this.sessionMap.get(sessionId)

    if (session) {
      session.markForDeletion()
      if (session.status !== 'close') await session.logout()
      this.sessionMap.delete(sessionId)
    }

    await prisma.waSession.update({
      where: {
        id: sessionId,
      },
      data: {
        enabled: false,
        archived: true,
      },
    })
    publishAppInvalidation({ resource: 'sessions', sessionId, ownerId: sessionFromDb.userId })
  }

  public async unArchiveSession(sessionId: string) {
    const session = await prisma.waSession.findUnique({
      where: {
        id: sessionId,
      },
      include: {
        config: true,
      },
    })

    if (!session) throw new SessionNotFoundError()

    await prisma.waSession.update({
      where: {
        id: sessionId,
      },
      data: {
        archived: false,
      },
    })
    publishAppInvalidation({ resource: 'sessions', sessionId, ownerId: session.userId })
  }

  public async removeSession(sessionId: string) {
    const stored = await prisma.waSession.findUnique({ where: { id: sessionId } })
    if (!stored) throw new SessionNotFoundError()
    const session = this.sessionMap.get(sessionId)

    if (session) {
      await session.prepareForDeletion()
      this.sessionMap.delete(sessionId)
    } else {
      const sessionFromDb = await prisma.waSession.findUnique({
        where: {
          id: sessionId,
        },
      })
      if (!sessionFromDb) {
        throw new SessionNotFoundError()
      }
    }

    await prisma.waSession.update({
      where: { id: sessionId },
      data: { enabled: false, status: 'close' },
    })
    await deleteSessionData(sessionId)
    publishAppInvalidation({
      resource: 'sessions',
      sessionId,
      ownerId: stored.userId,
      deleted: true,
    })

    logger.info(`Session removed: ${sessionId}`)
  }

  public async logoutSession(sessionId: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    await session.logout()
  }

  public disconnectSession(sessionId: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    session.disconnect()
  }

  public isSessionEnabled(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    return session?.enabled ?? false
  }

  public isSessionConnected(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    return session?.status === 'open'
  }

  public async loadWebhooks(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    if (!session) {
      throw new SessionNotFoundError()
    }

    const webhooks = await prisma.webhook.findMany({
      where: {
        waSessionId: sessionId,
      },
    })

    if (webhooks.length || session.webhooks.length !== webhooks.length) {
      session.webhooks = webhooks
      logger.info(`Webhooks loaded for session: ${sessionId}`)
    }
  }

  public async loadGlobalWebhooks() {
    this.globalWebhooks = await prisma.globalWebhook.findMany()
    logger.info('Global webhooks loaded')
  }

  public async sendTextMessage(
    sessionId: string,
    { number, message, mentions, quoted, delay, linkPreview, ...signature }: TextMessage,
  ) {
    const session = this.sessionMap.get(sessionId)
    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.sendMessage(
      JidCreator.createJid(number),
      {
        text: session.signTextMessage(message, signature),
        linkPreview: linkPreview ? undefined : null,
        ...(mentions && {
          mentions: mentions.map((mention) => JidCreator.createJid(mention)),
        }),
      },
      MessageType.text,
      {
        delay,
        quoted,
      },
    )
  }

  public async sendChatMessage(
    sessionId: string,
    jid: string,
    content: AnyMessageContent,
    type: MessageType,
    clientRequestId: string,
    quoted?: string,
    signature?: TextSignature,
  ) {
    const session = this.sessionMap.get(sessionId)
    if (!session) throw new SessionNotFoundError()
    const signedContent =
      type === MessageType.text && 'text' in content
        ? { ...content, text: session.signTextMessage(content.text, signature) }
        : content
    return session.sendMessage(jid, signedContent, type, { clientRequestId, quoted })
  }

  public async sendImageMessage(sessionId: string, messageData: ImageMessage) {
    const { number, delay, source, fileName, caption, ...rest } = messageData
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.sendMessage(
      JidCreator.createJid(number),
      await session.createMediaMessage({
        ...rest,
        number,
        caption,
        media: {
          source,
          fileName,
          type: 'image',
          gifPlayback: false,
        },
      }),
      MessageType.image,
      {
        delay,
      },
    )
  }

  public async sendVideoMessage(sessionId: string, messageData: VideoMessage) {
    const { number, delay, source, fileName, caption, gifPlayback, ...rest } = messageData
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.sendMessage(
      JidCreator.createJid(number),
      await session.createMediaMessage({
        ...rest,
        number,
        caption,
        media: {
          source,
          fileName,
          gifPlayback,
          type: 'video',
        },
      }),
      MessageType.video,
      {
        delay,
      },
    )
  }

  public async sendAudioMessage(sessionId: string, messageData: AudioMessage) {
    const { number, delay, source, caption, ...rest } = messageData
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.sendMessage(
      JidCreator.createJid(number),
      await session.createMediaMessage({
        ...rest,
        number,
        caption,
        media: {
          source,
          type: 'audio',
          gifPlayback: false,
        },
      }),
      MessageType.audio,
      {
        delay,
        presenceType: 'recording',
      },
    )
  }

  public async sendDocumentMessage(sessionId: string, messageData: DocumentMessage) {
    const { number, delay, source, fileName, caption, ...rest } = messageData
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.sendMessage(
      JidCreator.createJid(number),
      await session.createMediaMessage({
        ...rest,
        number,
        caption,
        media: {
          source,
          fileName,
          type: 'document',
          gifPlayback: false,
        },
      }),
      MessageType.document,
      {
        delay,
      },
    )
  }

  public async sendLocationMessage(
    sessionId: string,
    { location, number, delay }: LocationMessage,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    const message = {
      location: {
        ...location,
      },
    }

    if (!(location.degreesLatitude || location.degreesLongitude)) {
      if (!location.address) {
        throw new InvalidLocationError('At least one of address or coordinates is required')
      }
      const fetchedLocation = await getLocationFromAddress(location.address)
      if (fetchedLocation) {
        message.location.degreesLatitude = Number(fetchedLocation.lat)
        message.location.degreesLongitude = Number(fetchedLocation.lon)
      }
    }

    return await session.sendMessage(JidCreator.createJid(number), message, MessageType.location, {
      delay,
    })
  }

  public async sendContactMessage(sessionId: string, messageData: ContactMessage) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    const { contact } = messageData
    const vcard = createVcard({
      ...contact,
      wuid: JidCreator.createJid(contact.phoneNumber),
    })

    return await session.sendMessage(
      JidCreator.createJid(messageData.number),
      {
        contacts: {
          displayName: contact.displayName ?? `${contact.firstName} ${contact.lastName}`,
          contacts: [{ vcard }],
        },
      },
      MessageType.contact,
      {
        delay: messageData.delay,
      },
    )
  }

  public async editTextMessage(
    sessionId: string,
    key: import('baileys').WAMessageKey,
    text: string,
  ) {
    const session = this.sessionMap.get(sessionId)
    if (!session) throw new SessionNotFoundError()
    return session.editTextMessage(key, text)
  }

  public async deleteMessageForEveryone(
    sessionId: string,
    messageId: string,
    key?: import('baileys').WAMessageKey,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }
    return await session.deleteMessageForEveryOne(messageId, key)
  }

  public async getDisplayPicture(sessionId: string, identifier: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.getDisplayPicture(JidCreator.createJid(identifier))
  }

  public async refreshProfilePictures(sessionId: string) {
    const session = this.sessionMap.get(sessionId)
    if (!session) throw new SessionNotFoundError()
    await session.refreshProfilePicture()
  }

  public async getContactProfilePictureUrl(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)
    if (!session) throw new SessionNotFoundError()
    return session.getContactProfilePictureUrl(jid)
  }

  public async updateDisplayPicture(sessionId: string, identifier: string, source: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateDisplayPicture(JidCreator.createJid(identifier), source)
  }

  public async updateProfileName(sessionId: string, status: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateProfileName(status)
  }

  public async updateProfileStatus(sessionId: string, status: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateProfileStatus(status)
  }

  public async isOnWhatsApp(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.isOnWhatsApp(JidCreator.createJid(jid))
  }

  public async fetchStatus(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.fetchStatus(JidCreator.createJid(jid))
  }

  public async getMessageMedia(sessionId: string, messageId: string) {
    const file = await this.getMessageMediaBinary(sessionId, messageId)
    if (!file) return null
    const base64 = file.bytes.toString('base64')
    let mimeType = file.mimeType
    if (!mimeType) {
      try {
        mimeType = (await getMimeTypeFromBase64(base64, file.fileName ?? undefined)).mimeType
      } catch (error) {
        logger.debug({
          err: error,
          sessionId,
          messageId,
          msg: 'Media MIME type is unknown',
        })
      }
    }
    return {
      media: base64,
      mimeType,
      fileName: file.fileName,
    }
  }

  public async getMessageMediaBinary(sessionId: string, messageId: string) {
    const waMessage = await findLegacyMessage(sessionId, messageId)
    if (!waMessage) return null
    const media = await prisma.waMessageMedia.findUnique({
      where: { messageId: waMessage.id },
    })
    if (!media) return null
    const { retrieveChatMedia } = await import('../lib/chat-media.ts')
    return retrieveChatMedia(sessionId, waMessage.conversationId, media.id, false)
  }

  public async downloadConversationMedia(sessionId: string, message: WAProto.IWebMessageInfo) {
    const session = this.sessionMap.get(sessionId)
    if (!(session && this.isSessionConnected(sessionId))) throw new SessionNotFoundError()
    return session.getMessageMedia(message)
  }

  public async resendWebhookEvent({
    sessionId,
    webhookId,
    logId,
  }: {
    sessionId: string
    webhookId: string
    logId: string
  }) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    const log = await prisma.webhookLog.findUnique({
      where: {
        id: logId,
        webhookId,
        sessionId,
      },
      include: {
        webhook: true,
      },
    })

    if (!log?.payload) return null

    // The event name on WebhookLog is a free-form string; validate it against
    // the known event schema before passing it to forwardEvent (which requires
    // a typed event name).
    const eventNames = Object.keys(WebhookEventsSchema.shape) as Array<
      keyof typeof WebhookEventsSchema.shape
    >
    if (!(log.event && eventNames.includes(log.event as never))) {
      logger.warn({
        source: 'WhatsappService',
        function: 'resendWebhookEvent',
        sessionId,
        webhookId,
        logId,
        msg: `WebhookLog has unknown event: ${log.event}`,
        time: Date.now(),
      })
      return null
    }

    const payload = log.payload as Record<string, unknown>
    const messageId = log.messageId

    return session.resendWebhookEvent({
      url: log.url ?? log.webhook.url,
      parentLogId: log.id,
      event: log.event as keyof typeof WebhookEventsSchema.shape,
      payload,
      messageId,
      webhookId,
    })
  }

  public async createGroup(sessionId: string, groupData: CreateGroupBody) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.createGroup(
      groupData.subject,
      groupData.participants.map((number) => JidCreator.createJid(number)),
    )
  }

  public async listGroups(sessionId: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.listGroups()
  }

  public async updateGroupSubject(sessionId: string, jid: string, subject: string | undefined) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    if (subject) {
      return await session.updateGroupSubject(JidCreator.createJid(jid), subject)
    }

    return null
  }

  public async updateGroupDescription(
    sessionId: string,
    jid: string,
    description: string | undefined,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    if (description) {
      return await session.updateGroupDescription(JidCreator.createJid(jid), description)
    }

    return null
  }

  public async setOnlyAdminsCanPost(
    sessionId: string,
    jid: string,
    onlyAdminsCanPost: boolean | undefined,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    if (onlyAdminsCanPost !== undefined) {
      return session.setOnlyAdminsCanPost(JidCreator.createJid(jid), onlyAdminsCanPost)
    }

    return null
  }

  public async setOnlyAdminsCanEditInfo(
    sessionId: string,
    jid: string,
    onlyAdminsCanEditInfo: boolean | undefined,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    if (onlyAdminsCanEditInfo !== undefined) {
      return session.setOnlyAdminsCanEditInfo(JidCreator.createJid(jid), onlyAdminsCanEditInfo)
    }

    return null
  }

  public async updateGroupParticipants(
    sessionId: string,
    jid: string,
    participants: string[],
    action: ParticipantAction,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateGroupParticipants(
      jid,
      participants.map((number) => JidCreator.createJid(number)),
      action,
    )
  }

  public async leaveGroup(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.leaveGroup(jid)
  }

  public async getGroupInviteCode(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.getGroupInviteCode(jid)
  }

  public async revokeGroupInviteCode(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.revokeGroupInviteCode(jid)
  }

  public async blockContact(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.blockContact(JidCreator.createJid(jid))
  }

  public async unblockContact(sessionId: string, jid: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.unblockContact(JidCreator.createJid(jid))
  }

  // Privacy

  public async getPrivacySettings(sessionId: string) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.getPrivacySettings()
  }

  public async updateLastSeenPrivacy(sessionId: string, privacy: WAPrivacyValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateLastSeenPrivacy(privacy)
  }

  public async updateOnlinePrivacy(sessionId: string, privacy: WAPrivacyOnlineValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateOnlinePrivacy(privacy)
  }

  public async updateProfilePicturePrivacy(sessionId: string, privacy: WAPrivacyValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateProfilePicturePrivacy(privacy)
  }

  public async updateStatusPrivacy(sessionId: string, privacy: WAPrivacyValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateStatusPrivacy(privacy)
  }

  public async updateReadReceiptsPrivacy(sessionId: string, privacy: WAReadReceiptsValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateReadReceiptsPrivacy(privacy)
  }

  public async updateGroupsAddPrivacy(sessionId: string, privacy: WAPrivacyGroupAddValue) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateGroupsAddPrivacy(privacy)
  }

  public async updateDefaultDisappearingMode(
    sessionId: string,
    mode: keyof typeof DefaultDisappearingMode,
  ) {
    const session = this.sessionMap.get(sessionId)

    if (!session) {
      throw new SessionNotFoundError()
    }

    return await session.updateDefaultDisappearingMode(mode)
  }
}

export const whatsappService = WhatsappService.getInstance()

export default whatsappService

import { deleteSessionData } from '../lib/session-deletion.ts'
