import { ForbiddenError } from '@server/common/errors/forbidden-error'
import { NotFoundError } from '@server/common/errors/not-found-error'
import { ValidationError } from '@server/common/errors/validation-error'
import {
  AccessDeniedError,
  InvalidJidError,
  InvalidSessionError,
  SessionNotFoundError,
} from '@services/errors'
import { whatsappService } from '@services/whatsapp'

import type {
  UpdateDefaultDisappearingModeInput,
  UpdateGroupsAddPrivacyInput,
  UpdateOnlinePrivacyInput,
  UpdatePrivacyInput,
  UpdateReadReceiptsPrivacyInput,
} from './types.ts'

async function mapWhatsappErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      throw new NotFoundError(error.message)
    }

    if (error instanceof AccessDeniedError) {
      throw new ForbiddenError(error.message)
    }

    if (error instanceof InvalidSessionError || error instanceof InvalidJidError) {
      throw new ValidationError(error.message, error)
    }

    throw error
  }
}

export function getPrivacySettings(sessionId: string) {
  return mapWhatsappErrors(() => whatsappService.getPrivacySettings(sessionId))
}

export function updateLastSeenPrivacy(sessionId: string, { privacy }: UpdatePrivacyInput) {
  return mapWhatsappErrors(() => whatsappService.updateLastSeenPrivacy(sessionId, privacy))
}

export function updateOnlinePrivacy(sessionId: string, { privacy }: UpdateOnlinePrivacyInput) {
  return mapWhatsappErrors(() => whatsappService.updateOnlinePrivacy(sessionId, privacy))
}

export function updateProfilePicturePrivacy(sessionId: string, { privacy }: UpdatePrivacyInput) {
  return mapWhatsappErrors(() => whatsappService.updateProfilePicturePrivacy(sessionId, privacy))
}

export function updateStatusPrivacy(sessionId: string, { privacy }: UpdatePrivacyInput) {
  return mapWhatsappErrors(() => whatsappService.updateStatusPrivacy(sessionId, privacy))
}

export function updateReadReceiptsPrivacy(
  sessionId: string,
  { privacy }: UpdateReadReceiptsPrivacyInput,
) {
  return mapWhatsappErrors(() => whatsappService.updateReadReceiptsPrivacy(sessionId, privacy))
}

export function updateGroupsAddPrivacy(
  sessionId: string,
  { privacy }: UpdateGroupsAddPrivacyInput,
) {
  return mapWhatsappErrors(() => whatsappService.updateGroupsAddPrivacy(sessionId, privacy))
}

export function updateDefaultDisappearingMode(
  sessionId: string,
  { mode }: UpdateDefaultDisappearingModeInput,
) {
  return mapWhatsappErrors(() => whatsappService.updateDefaultDisappearingMode(sessionId, mode))
}
