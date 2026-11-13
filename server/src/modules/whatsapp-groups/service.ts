import { buildInviteLink } from '@lib/utils'
import { NotFoundError } from '@server/common/errors/not-found-error'
import { ValidationError } from '@server/common/errors/validation-error'
import { InvalidJidError, InvalidSessionError, SessionNotFoundError } from '@services/errors'
import { whatsappService } from '@services/whatsapp'

import type {
  CreateGroupInput,
  GroupParticipantAction,
  SendGroupInviteInput,
  UpdateGroupInput,
  UpdateGroupParticipantsInput,
} from './types.ts'

async function mapWhatsappErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      throw new NotFoundError(error.message)
    }

    if (error instanceof InvalidSessionError || error instanceof InvalidJidError) {
      throw new ValidationError(error.message, error)
    }

    throw error
  }
}

export function listGroups(sessionId: string) {
  return mapWhatsappErrors(async () => {
    const groups = await whatsappService.listGroups(sessionId)
    return groups ? Object.values(groups) : []
  })
}

export function createGroup(sessionId: string, data: CreateGroupInput) {
  return mapWhatsappErrors(async () => {
    const group = await whatsappService.createGroup(sessionId, data)

    if (!group) {
      throw new ValidationError('Failed to create group')
    }

    await whatsappService.updateGroupDescription(sessionId, group.id, data.description)

    return group
  })
}

export function updateGroup(sessionId: string, jid: string, data: UpdateGroupInput) {
  return mapWhatsappErrors(async () => {
    // Keep these operations sequential to avoid rate limiting or a WhatsApp ban.
    await whatsappService.updateGroupSubject(sessionId, jid, data.subject)
    await whatsappService.updateGroupDescription(sessionId, jid, data.description)
    await whatsappService.setOnlyAdminsCanPost(sessionId, jid, data.onlyAdminsCanPost)
    await whatsappService.setOnlyAdminsCanEditInfo(sessionId, jid, data.onlyAdminsCanEditInfo)
  })
}

export function getGroupInviteCode(sessionId: string, jid: string) {
  return mapWhatsappErrors(async () => {
    const inviteCode = await whatsappService.getGroupInviteCode(sessionId, jid)

    if (!inviteCode) {
      throw new ValidationError('Failed to retrieve group invite code')
    }

    return inviteCode
  })
}

export function revokeGroupInviteCode(sessionId: string, jid: string) {
  return mapWhatsappErrors(() => whatsappService.revokeGroupInviteCode(sessionId, jid))
}

export function leaveGroup(sessionId: string, jid: string) {
  return mapWhatsappErrors(() => whatsappService.leaveGroup(sessionId, jid))
}

export function updateGroupParticipants(
  sessionId: string,
  jid: string,
  participants: UpdateGroupParticipantsInput,
  action: GroupParticipantAction,
) {
  return mapWhatsappErrors(() =>
    whatsappService.updateGroupParticipants(sessionId, jid, participants, action),
  )
}

export function sendGroupInvite(sessionId: string, jid: string, data: SendGroupInviteInput) {
  return mapWhatsappErrors(async () => {
    const inviteCode = await whatsappService.getGroupInviteCode(sessionId, jid)

    if (!inviteCode) {
      throw new ValidationError('Failed to retrieve group invite code')
    }

    const message = data.message
      ? `${data.message}\n${buildInviteLink(inviteCode)}`
      : `Join my group with this invite link 👇\n${buildInviteLink(inviteCode)}`
    const sentMessage = await whatsappService.sendTextMessage(sessionId, {
      message,
      number: data.number,
      linkPreview: true,
    })

    if (!sentMessage) {
      throw new ValidationError('Failed to send group invite')
    }

    return sentMessage
  })
}
