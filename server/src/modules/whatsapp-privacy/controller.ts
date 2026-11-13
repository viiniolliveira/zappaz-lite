import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  PrivacyParamsSchema,
  UpdateDefaultDisappearingModeSchema,
  UpdateGroupsAddPrivacyValueSchema,
  UpdateOnlinePrivacyValueSchema,
  UpdatePrivacyValueSchema,
  UpdateReadReceiptsPrivacyValueSchema,
} from './schema.ts'
import {
  getPrivacySettings,
  updateDefaultDisappearingMode,
  updateGroupsAddPrivacy,
  updateLastSeenPrivacy,
  updateOnlinePrivacy,
  updateProfilePicturePrivacy,
  updateReadReceiptsPrivacy,
  updateStatusPrivacy,
} from './service.ts'

export async function getPrivacySettingsController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const settings = await getPrivacySettings(sessionId)

  return c.json(settings, 200)
}

export async function updateLastSeenPrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdatePrivacyValueSchema.parse(await c.req.json())
  await updateLastSeenPrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Last seen privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateOnlinePrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdateOnlinePrivacyValueSchema.parse(await c.req.json())
  await updateOnlinePrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Online privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateProfilePicturePrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdatePrivacyValueSchema.parse(await c.req.json())
  await updateProfilePicturePrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Profile picture privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateStatusPrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdatePrivacyValueSchema.parse(await c.req.json())
  await updateStatusPrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Status privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateReadReceiptsPrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdateReadReceiptsPrivacyValueSchema.parse(await c.req.json())
  await updateReadReceiptsPrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Read receipts privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateGroupsAddPrivacyController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdateGroupsAddPrivacyValueSchema.parse(await c.req.json())
  await updateGroupsAddPrivacy(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Groups add privacy updated',
      privacy: data.privacy,
    },
    200,
  )
}

export async function updateDefaultDisappearingModeController(c: Context<AppEnv>) {
  const { sessionId } = PrivacyParamsSchema.parse(c.req.param())
  const data = UpdateDefaultDisappearingModeSchema.parse(await c.req.json())
  await updateDefaultDisappearingMode(sessionId, data)

  return c.json(
    {
      status: 'success',
      message: 'Default disappearing mode updated',
      mode: data.mode,
    },
    200,
  )
}
