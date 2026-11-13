import { BadRequestError } from '@server/common/errors/bad-request-error'
import { NotFoundError } from '@server/common/errors/not-found-error'
import {
  AccessDeniedError,
  InvalidJidError,
  InvalidSessionError,
  SessionNotFoundError,
} from '@services/errors'
import { whatsappService } from '@services/whatsapp'

import type {
  GetDisplayPictureQuery,
  UpdateDisplayPictureInput,
  UpdateProfileNameInput,
  UpdateProfileStatusInput,
} from './types.ts'

const executeWhatsappAction = async <T>(action: () => Promise<T>) => {
  try {
    return await action()
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      throw new NotFoundError(error.message)
    }

    if (
      error instanceof InvalidJidError ||
      error instanceof AccessDeniedError ||
      error instanceof InvalidSessionError
    ) {
      throw new BadRequestError(error.message, error)
    }

    throw error
  }
}

export const updateProfileName = (sessionId: string, data: UpdateProfileNameInput) =>
  executeWhatsappAction(() => whatsappService.updateProfileName(sessionId, data.name))

export const updateProfileStatus = (sessionId: string, data: UpdateProfileStatusInput) =>
  executeWhatsappAction(() => whatsappService.updateProfileStatus(sessionId, data.status))

export const updateDisplayPicture = (sessionId: string, data: UpdateDisplayPictureInput) =>
  executeWhatsappAction(() =>
    whatsappService.updateDisplayPicture(sessionId, data.identifier, data.source),
  )

export const getDisplayPicture = async (sessionId: string, query: GetDisplayPictureQuery) => {
  const displayPicture = await executeWhatsappAction(() =>
    whatsappService.getDisplayPicture(sessionId, query.identifier),
  )

  if (!displayPicture) {
    throw new NotFoundError('Display picture not found')
  }

  return displayPicture
}

export const isOnWhatsApp = async (sessionId: string, jid: string) => {
  const result = await executeWhatsappAction(() => whatsappService.isOnWhatsApp(sessionId, jid))

  return result?.[0]?.exists
}

export const getAbout = async (sessionId: string, jid: string) => {
  const result = await executeWhatsappAction(() => whatsappService.fetchStatus(sessionId, jid))

  if (!result) {
    throw new NotFoundError(`Unable to determine status of contact: ${jid}`)
  }

  return result
}

export const blockContact = (sessionId: string, jid: string) =>
  executeWhatsappAction(() => whatsappService.blockContact(sessionId, jid))

export const unblockContact = (sessionId: string, jid: string) =>
  executeWhatsappAction(() => whatsappService.unblockContact(sessionId, jid))
