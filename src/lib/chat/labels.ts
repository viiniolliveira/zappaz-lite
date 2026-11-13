import { z } from 'zod'

export const labelFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(60, 'Use até 60 caracteres'),
  description: z.string().trim().max(500, 'Use até 500 caracteres'),
  color: z.string().regex(/^#[0-9a-f]{6}$/, 'Selecione uma cor'),
})
export const labelSchema = labelFormSchema.extend({ id: z.uuid(), sessionId: z.string().min(1) })
export type ChatLabel = z.infer<typeof labelSchema>
export type LabelInput = z.infer<typeof labelFormSchema>
export const conversationLabelsFormSchema = z.object({ labelIds: z.array(z.uuid()).max(100) })
export type ConversationLabelsInput = z.infer<typeof conversationLabelsFormSchema>

export const bulkLabelsFormSchema = z.object({ changes: z.record(z.uuid(), z.boolean()) })
export type BulkLabelsInput = z.infer<typeof bulkLabelsFormSchema>

export function getBulkLabelState(
  conversations: { labelIds: string[] }[],
  labelId: string,
): boolean | 'indeterminate' {
  const count = conversations.filter((conversation) =>
    conversation.labelIds.includes(labelId),
  ).length
  if (!count) return false
  return count === conversations.length ? true : 'indeterminate'
}

export const labelColors = [
  { name: 'Turquesa', value: '#14b8a6' },
  { name: 'Ciano', value: '#06b6d4' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Índigo', value: '#6366f1' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Roxo', value: '#a855f7' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Rosé', value: '#f43f5e' },
  { name: 'Vermelho', value: '#ef4444' },
  { name: 'Laranja', value: '#f97316' },
  { name: 'Amarelo', value: '#eab308' },
  { name: 'Lima', value: '#84cc16' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Esmeralda', value: '#10b981' },
  { name: 'Marrom', value: '#a16207' },
  { name: 'Cinza', value: '#737373' },
] as const
