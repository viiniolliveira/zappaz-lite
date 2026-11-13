import { prisma } from '@db/prisma'
import { logger } from '@lib/logger'
import whatsappService from '@server/services/whatsapp'
import { InvalidMediaError } from '@services/errors'
import { AxiosError, type AxiosHeaderValue, type AxiosResponse } from 'axios'
import { getContentType, getDevice, type WAProto } from 'baileys'
import { fileTypeFromBuffer } from 'file-type'
import { DateTime } from 'luxon'
import mime from 'mime'
import validator from 'validator'
import { AppError } from '../common/errors/app-error.ts'
import { config } from '../config.ts'
import axios from './axios-instance.ts'
import { pruneChatMessages } from './chat-retention.ts'
import { reconcileMediaFiles } from './media-cleanup.ts'

const ONE_DAY = 86_400_000

async function removeMessages() {
  try {
    if (config.messageRetentionDays !== null) {
      const removal = await pruneChatMessages(
        new Date(Date.now() - config.messageRetentionDays * ONE_DAY),
      )
      logger.info(
        `Periodical message clean up removed ${removal.count} messages at ${new Date().toISOString()}`,
      )
    }
    await reconcileMediaFiles()
  } catch (error) {
    logger.error({
      msg: 'Unknown error during periodical message clean up',
      stack: (error as Error)?.stack,
      extra: {
        source: 'removeMessages',
        function: 'removeMessages',
      },
    })
  }
}

async function removeWebhookLogs(retentionDays: number) {
  try {
    const removal = await prisma.webhookLog.deleteMany({
      where: {
        createdAt: {
          lte: new Date(Date.now() - retentionDays * ONE_DAY),
        },
      },
    })
    logger.info(
      `Periodical webhook log clean up removed ${removal.count} logs at ${new Date().toISOString()}`,
    )
  } catch (error) {
    logger.error({
      msg: 'Unknown error during periodical webhook log clean up',
      stack: (error as Error)?.stack,
      extra: {
        source: 'removeWebhookLogs',
        function: 'removeWebhookLogs',
      },
    })
  }
}

async function updateProfilePicture() {
  try {
    const sessions = await prisma.waSession.findMany({
      where: {
        status: 'open',
        archived: false,
        enabled: true,
      },
    })

    if (sessions.length === 0) {
      logger.info(`No sessions require profile picture update at ${new Date().toISOString()}`)
      return
    }

    for (const session of sessions) {
      if (!session.jid) continue

      try {
        await whatsappService.refreshProfilePictures(session.id)
      } catch (error) {
        logger.error({
          msg: `Error updating profile picture for session ${session.id}`,
          stack: (error as Error)?.stack,
          extra: {
            source: 'updateProfilePicture',
            function: 'updateProfilePicture',
            sessionId: session.id,
          },
        })
      }
    }
  } catch (error) {
    logger.error({
      msg: 'Error during profile picture update',
      stack: (error as Error)?.stack,
      extra: {
        source: 'updateProfilePicture',
        function: 'updateProfilePicture',
      },
    })
  }
}

export function runScheduledTasks() {
  Bun.cron('@hourly', removeMessages)
  const retentionDays = config.webhookLogRetentionDays
  if (retentionDays !== null) Bun.cron('@hourly', () => removeWebhookLogs(retentionDays))
  Bun.cron('@hourly', updateProfilePicture)
}

/**
 * Runs an interval that checks if the provided condition is met, and then executes the provided callback.
 * If the condition is not met after the provided timeout, the function rejects with an error.
 */
export function waitUntil({
  topic,
  condition,
  callback,
  interval = 100,
  timeout = 5000,
}: {
  condition: () => Promise<boolean> | boolean
  callback: () => Promise<void> | void
  interval?: number
  timeout?: number
  topic?: string
}): Promise<void> {
  return new Promise<void>((resolve) => {
    const startTime = Date.now()

    const checkCondition = async () => {
      try {
        const result = await condition()
        if (result) {
          await callback()
          resolve()
        } else if (Date.now() - startTime >= timeout) {
          logger.warn({
            source: 'waitUntil',
            msg: 'Condition not met within timeout',
            time: Date.now(),
            topic,
          })
        } else {
          setTimeout(checkCondition, interval)
        }
      } catch (error) {
        logger.debug(error)
        logger.error({
          msg: 'Error checking condition',
          stack: (error as Error)?.stack,
          extra: {
            source: 'waitUntil',
            function: 'waitUntil',
            topic,
          },
        })
      }
    }

    checkCondition()
  })
}

// Function that can be awaited for a specified amount of time
export const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })

export function isUrl(candidateString: string) {
  return validator.isURL(candidateString, { require_protocol: true })
}

export function cleanBase64String(base64String: string) {
  return base64String.replace(/^data:.*;base64,/, '')
}

export function getBase64Buffer(base64String: string) {
  const source = cleanBase64String(base64String)
  if (Buffer.byteLength(source, 'base64') > config.mediaMaxFileSizeBytes)
    throw new AppError({
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: `File exceeds ${config.mediaMaxFileSizeMb} MiB`,
    })
  return Buffer.from(source, 'base64')
}

export function isBase64(candidateString: string) {
  return validator.isBase64(cleanBase64String(candidateString))
}

export async function urlToBase64(url: string) {
  const res = await axios.get(url, { responseType: 'arraybuffer' })
  const base64 = Buffer.from(res.data).toString('base64')
  const contentType = res.headers['content-type'] || 'application/octet-stream'
  return `data:${contentType};base64,${base64}`
}

interface MimeTypeResult {
  mimeType: string | null
  buffer: Buffer
}

export async function getMimeTypeFromBase64(
  base64String: string,
  fileName?: string,
): Promise<MimeTypeResult> {
  const buffer = getBase64Buffer(base64String)
  const fileTypeResult = await fileTypeFromBuffer(
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length),
  )
  const fallbackMimeType = fileName ? mime.getType(fileName) : null
  const mimeType = fileTypeResult?.mime ?? fallbackMimeType

  if (!mimeType) {
    throw new Error('Could not determine mime type from base64 string or file name')
  }

  return {
    mimeType,
    buffer,
  }
}

export async function getMimeTypeFromUrl(url: string): Promise<MimeTypeResult | null> {
  try {
    const externalMedia = await axios({
      url,
      method: 'get',
      responseType: 'arraybuffer',
    })
    const mimeType: AxiosHeaderValue | undefined = externalMedia.headers['content-type'] as
      | string
      | undefined
    if (mimeType) {
      return {
        mimeType,
        buffer: Buffer.from(externalMedia.data, 'binary'),
      }
    }
  } catch (error) {
    if (error instanceof AxiosError && error.status === 404) {
      throw new InvalidMediaError('Could not fetch file from URL')
    }
    logger.warn({
      source: 'getMimeTypeFromUrl',
      msg: 'Error fetching file from URL',
      time: Date.now(),
      error: error instanceof Error ? error.message : error,
    })
  }
  return null
}

export const status = {
  0: 'ERROR',
  1: 'PENDING',
  2: 'SERVER_ACK',
  3: 'DELIVERY_ACK',
  4: 'READ',
  5: 'PLAYED',
}

interface FormattedMessage {
  sessionId: string
  key: WAProto.IMessageKey | null | undefined
  status: string | null
  pushName: string | null | undefined
  message: WAProto.IMessage
  contextInfo: WAProto.IContextInfo | null
  messageType: string
  messageTimestamp: number
  source?: string
}

export function formatMessage(sessionId: string, message: WAProto.IWebMessageInfo) {
  const contentType = getContentType(message.message ?? undefined)
  const contentMsg = contentType && message?.message ? message.message[contentType] : null

  const formattedMessage: FormattedMessage = {
    sessionId,
    key: message.key,
    pushName: message.pushName,
    message: { ...message.message },
    status: message.status ? status[message.status] : null,
    contextInfo: (() => {
      if (contentMsg && typeof contentMsg !== 'string') {
        // biome-ignore lint/suspicious/noExplicitAny: trust me bro.
        return (contentMsg as any).contextInfo
      }
      return null
    })(),
    messageType: contentType || 'unknown',
    messageTimestamp: message.messageTimestamp as number,
    ...(message.key?.id && { source: getDevice(message.key.id) }),
  }

  if (!formattedMessage.status && message.key?.fromMe === false) {
    formattedMessage.status = status[3] // DELIVERY_ACK
  }

  if (formattedMessage.message.extendedTextMessage) {
    formattedMessage.messageType = 'conversation'
    formattedMessage.message.conversation = formattedMessage.message.extendedTextMessage.text
    formattedMessage.message.extendedTextMessage = undefined
  }

  if (formattedMessage.message.documentWithCaptionMessage) {
    formattedMessage.messageType = 'documentMessage'
    formattedMessage.message.documentMessage =
      formattedMessage.message.documentWithCaptionMessage.message?.documentMessage
    formattedMessage.message.documentWithCaptionMessage = undefined
  }

  return formattedMessage
}

export function getFileName(fileName = 'file', mimeType: string) {
  const fileNameWithoutExtension = fileName.split('.').slice(0, -1).join('.')
  const extension = mime.getExtension(mimeType) || 'bin'
  return `${fileNameWithoutExtension}.${extension}`
}

export function buildInviteLink(inviteCode: string) {
  return `https://chat.whatsapp.com/${inviteCode}`
}

export const isValidDateRange = (startDate: string, endDate: string) => {
  return DateTime.fromISO(startDate) < DateTime.fromISO(endDate)
}

export const isValidDate = (date: string) => {
  return DateTime.fromISO(date).isValid
}

export const parseAxiosHeaders = (response: AxiosResponse | undefined) => {
  const headers = response?.headers

  if (!headers) return null

  return 'toJSON' in headers && typeof headers.toJSON === 'function' ? headers.toJSON() : headers
}

export async function getLocationFromAddress(address: string) {
  try {
    const response = await axios<
      Array<{ lat: string; lon: string; name: string; display_name: string }>
    >({
      method: 'GET',
      url: 'https://nominatim.openstreetmap.org/search',
      params: {
        format: 'json',
        q: address.trim().replace(/,/g, ''),
      },
    })
    return response.data[0]
  } catch (error) {
    logger.warn({
      source: 'getLocationFromAddress',
      msg: 'Error fetching location from address',
      time: Date.now(),
      error: error instanceof Error ? error.message : error,
    })
  }
}
