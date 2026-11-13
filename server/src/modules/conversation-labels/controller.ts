import type { Context } from 'hono'
import type { AppEnv } from '../../create-app.ts'
import { ConversationParamsSchema } from '../conversations/schema.ts'
import { ConversationLabelsSchema, LabelParamsSchema, SaveLabelSchema } from './schema.ts'
import { deleteLabel, listLabels, saveLabel, setConversationLabels } from './service.ts'

export async function listLabelsController(c: Context<AppEnv>) {
  return c.json({ status: 'success', data: await listLabels(c.req.param('sessionId') ?? '') })
}
export async function createLabelController(c: Context<AppEnv>) {
  return c.json(
    {
      status: 'success',
      data: await saveLabel(
        c.req.param('sessionId') ?? '',
        SaveLabelSchema.parse(await c.req.json()),
      ),
    },
    201,
  )
}
export async function updateLabelController(c: Context<AppEnv>) {
  const { sessionId, labelId } = LabelParamsSchema.parse(c.req.param())
  return c.json({
    status: 'success',
    data: await saveLabel(sessionId, SaveLabelSchema.parse(await c.req.json()), labelId),
  })
}
export async function deleteLabelController(c: Context<AppEnv>) {
  const { sessionId, labelId } = LabelParamsSchema.parse(c.req.param())
  await deleteLabel(sessionId, labelId)
  return c.json({ status: 'success', data: { labelId } })
}
export async function setConversationLabelsController(c: Context<AppEnv>) {
  const { sessionId, conversationId } = ConversationParamsSchema.parse(c.req.param())
  const { labelIds } = ConversationLabelsSchema.parse(await c.req.json())
  return c.json({
    status: 'success',
    data: await setConversationLabels(sessionId, conversationId, labelIds),
  })
}
