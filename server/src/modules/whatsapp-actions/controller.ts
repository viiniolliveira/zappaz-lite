import type { AppEnv } from '@server/create-app'
import type { Context } from 'hono'

import {
  ContactParamsSchema,
  GetDisplayPictureQuerySchema,
  SessionParamsSchema,
  UpdateDisplayPictureBodySchema,
  UpdateProfileNameBodySchema,
  UpdateProfileStatusBodySchema,
} from './schema.ts'
import {
  blockContact,
  getAbout,
  getDisplayPicture,
  isOnWhatsApp,
  unblockContact,
  updateDisplayPicture,
  updateProfileName,
  updateProfileStatus,
} from './service.ts'

export async function updateProfileNameController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = UpdateProfileNameBodySchema.parse(await c.req.json())
  await updateProfileName(sessionId, body)

  return c.json({ status: 'success', message: 'Profile name updated', name: body.name }, 200)
}

export async function updateProfileStatusController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = UpdateProfileStatusBodySchema.parse(await c.req.json())
  await updateProfileStatus(sessionId, body)

  return c.json(
    {
      status: 'success',
      message: 'Profile status (about) updated',
      profileStatus: body.status,
    },
    200,
  )
}

export async function updateDisplayPictureController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const body = UpdateDisplayPictureBodySchema.parse(await c.req.json())
  await updateDisplayPicture(sessionId, body)

  return c.json({ status: 'success', message: 'Display picture updated' }, 200)
}

export async function getDisplayPictureController(c: Context<AppEnv>) {
  const { sessionId } = SessionParamsSchema.parse(c.req.param())
  const query = GetDisplayPictureQuerySchema.parse(c.req.query())
  const displayPicture = await getDisplayPicture(sessionId, query)

  return c.json(displayPicture, 200)
}

export async function isOnWhatsAppController(c: Context<AppEnv>) {
  const { sessionId, jid } = ContactParamsSchema.parse(c.req.param())
  const result = await isOnWhatsApp(sessionId, jid)

  return c.json({ isOnWhatsApp: result }, 200)
}

export async function getAboutController(c: Context<AppEnv>) {
  const { sessionId, jid } = ContactParamsSchema.parse(c.req.param())
  const result = await getAbout(sessionId, jid)

  return c.json(result, 200)
}

export async function blockContactController(c: Context<AppEnv>) {
  const { sessionId, jid } = ContactParamsSchema.parse(c.req.param())
  await blockContact(sessionId, jid)

  return c.json({ status: 'success', message: `Contact ${jid} blocked` }, 200)
}

export async function unblockContactController(c: Context<AppEnv>) {
  const { sessionId, jid } = ContactParamsSchema.parse(c.req.param())
  await unblockContact(sessionId, jid)

  return c.json({ status: 'success', message: `Contact ${jid} unblocked` }, 200)
}
