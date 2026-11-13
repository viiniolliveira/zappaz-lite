import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  CreateGroupBodySchema,
  GroupParamsSchema,
  SendGroupInviteBodySchema,
  SessionParamsSchema,
  UpdateGroupBodySchema,
  UpdateGroupParticipantsBodySchema,
} from './schema.ts'
import {
  createGroup,
  getGroupInviteCode,
  leaveGroup,
  listGroups,
  revokeGroupInviteCode,
  sendGroupInvite,
  updateGroup,
  updateGroupParticipants,
} from './service.ts'
import type { GroupParticipantAction } from './types.ts'

export async function listGroupsController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const groups = await listGroups(sessionId)

  return c.json(groups, 200)
}

export async function createGroupController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const data = CreateGroupBodySchema.parse(await c.req.json())
  const group = await createGroup(sessionId, data)

  return c.json(group, 200)
}

export async function updateGroupController(c: Context<AppEnv>) {
  const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
  const data = UpdateGroupBodySchema.parse(await c.req.json())
  await updateGroup(sessionId, jid, data)

  return c.json({ status: 'success', message: 'Group updated' }, 200)
}

export async function getInviteCodeController(c: Context<AppEnv>) {
  const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
  const inviteCode = await getGroupInviteCode(sessionId, jid)

  return c.json(
    {
      status: 'success',
      inviteCode,
      inviteUrl: `https://chat.whatsapp.com/${inviteCode}`,
    },
    200,
  )
}

export async function revokeInviteCodeController(c: Context<AppEnv>) {
  const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
  const newInviteCode = await revokeGroupInviteCode(sessionId, jid)

  return c.json(
    {
      status: 'success',
      message: 'Invite code revoked',
      newInviteCode,
      newInviteCodeUrl: `https://chat.whatsapp.com/${newInviteCode}`,
    },
    200,
  )
}

export async function leaveGroupController(c: Context<AppEnv>) {
  const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
  await leaveGroup(sessionId, jid)

  return c.json({ status: 'success', message: 'Left group' }, 200)
}

export function updateGroupParticipantsController(action: GroupParticipantAction) {
  return async (c: Context<AppEnv>) => {
    const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
    const participants = UpdateGroupParticipantsBodySchema.parse(await c.req.json())
    const result = await updateGroupParticipants(sessionId, jid, participants, action)

    return c.json(result, 200)
  }
}

export async function sendInviteController(c: Context<AppEnv>) {
  const { sessionId, jid } = GroupParamsSchema.parse(c.req.param())
  const data = SendGroupInviteBodySchema.parse(await c.req.json())
  const sentMessage = await sendGroupInvite(sessionId, jid, data)

  return c.json({ status: 'success', message: sentMessage }, 200)
}
