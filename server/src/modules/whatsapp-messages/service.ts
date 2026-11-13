import { BadRequestError } from '@server/common/errors/bad-request-error'
import { NotFoundError } from '@server/common/errors/not-found-error'
import {
  AccessDeniedError,
  InvalidJidError,
  InvalidLocationError,
  InvalidMediaError,
  InvalidSessionError,
  SessionNotFoundError,
} from '@services/errors'
import { whatsappService } from '@services/whatsapp'

import type {
  AudioMessageInput,
  ContactMessageInput,
  DocumentMessageInput,
  ImageMessageInput,
  LocationMessageInput,
  TextMessageInput,
  VideoMessageInput,
} from './types.ts'

const executeWhatsappMessage = async <T>(action: () => Promise<T>) => {
  try {
    return await action()
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      throw new NotFoundError(error.message)
    }

    if (
      error instanceof InvalidMediaError ||
      error instanceof InvalidJidError ||
      error instanceof InvalidLocationError ||
      error instanceof InvalidSessionError ||
      error instanceof AccessDeniedError
    ) {
      throw new BadRequestError(error.message, error)
    }

    throw error
  }
}

const normalizeCaption = (caption: string | undefined | null) => {
  if (!caption || caption === 'null' || caption === 'undefined') return ''
  return caption
}

export const sendTextMessage = (sessionId: string, data: TextMessageInput) =>
  executeWhatsappMessage(() => whatsappService.sendTextMessage(sessionId, data))

export const sendContactMessage = (sessionId: string, data: ContactMessageInput) =>
  executeWhatsappMessage(() => whatsappService.sendContactMessage(sessionId, data))

export const sendLocationMessage = (sessionId: string, data: LocationMessageInput) =>
  executeWhatsappMessage(() => whatsappService.sendLocationMessage(sessionId, data))

export const sendImageMessage = (sessionId: string, data: ImageMessageInput) =>
  executeWhatsappMessage(() =>
    whatsappService.sendImageMessage(sessionId, {
      ...data,
      caption: normalizeCaption(data.caption),
    }),
  )

export const sendVideoMessage = (sessionId: string, data: VideoMessageInput) =>
  executeWhatsappMessage(() =>
    whatsappService.sendVideoMessage(sessionId, {
      ...data,
      caption: normalizeCaption(data.caption),
    }),
  )

export const sendAudioMessage = (sessionId: string, data: AudioMessageInput) =>
  executeWhatsappMessage(() =>
    whatsappService.sendAudioMessage(sessionId, {
      ...data,
      caption: normalizeCaption(data.caption),
    }),
  )

export const sendDocumentMessage = (sessionId: string, data: DocumentMessageInput) =>
  executeWhatsappMessage(() =>
    whatsappService.sendDocumentMessage(sessionId, {
      ...data,
      caption: normalizeCaption(data.caption),
    }),
  )

export const deleteMessageForEveryone = (sessionId: string, messageId: string) =>
  executeWhatsappMessage(() => whatsappService.deleteMessageForEveryone(sessionId, messageId))

export const getMessageMedia = async (sessionId: string, messageId: string) => {
  const media = await executeWhatsappMessage(() =>
    whatsappService.getMessageMedia(sessionId, messageId),
  )

  if (!media) {
    throw new NotFoundError('Media unavailable or expired')
  }

  return media
}

export const getMessageMediaBinary = async (sessionId: string, messageId: string) => {
  const media = await executeWhatsappMessage(() =>
    whatsappService.getMessageMediaBinary(sessionId, messageId),
  )
  if (!media) throw new NotFoundError('Media unavailable or expired')
  return media
}
