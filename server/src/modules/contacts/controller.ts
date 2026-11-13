import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import {
  ContactParamsSchema,
  ContactQuerySchema,
  SaveContactSchema,
  UpdateContactSchema,
} from './schema.ts'
import {
  deleteContact,
  listContacts,
  refreshContactAvatar,
  saveContact,
  saveExistingContact,
  updateContact,
} from './service.ts'
export async function refreshContactAvatarController(c: Context<AppEnv>) {
  const { sessionId, contactId } = ContactParamsSchema.parse(c.req.param())
  return c.json({ status: 'success', data: await refreshContactAvatar(sessionId, contactId) })
}
export async function listContactsController(c: Context<AppEnv>) {
  return c.json(
    await listContacts(c.req.param('sessionId') ?? '', ContactQuerySchema.parse(c.req.query())),
  )
}
export async function saveContactController(c: Context<AppEnv>) {
  const input = SaveContactSchema.parse(await c.req.json())
  return c.json(
    {
      status: 'success',
      data: await saveContact(c.req.param('sessionId') ?? '', input),
    },
    201,
  )
}
export async function updateContactController(c: Context<AppEnv>) {
  const { contactId } = ContactParamsSchema.parse(c.req.param())
  const input = UpdateContactSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await updateContact(c.req.param('sessionId') ?? '', contactId, input),
  })
}
export async function deleteContactController(c: Context<AppEnv>) {
  const { contactId } = ContactParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await deleteContact(c.req.param('sessionId') ?? '', contactId),
  })
}
export async function saveExistingContactController(c: Context<AppEnv>) {
  const { sessionId, contactId } = ContactParamsSchema.parse(c.req.param())
  const input = UpdateContactSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await saveExistingContact(sessionId, contactId, input),
  })
}
