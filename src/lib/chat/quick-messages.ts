import { z } from 'zod'

export const quickMessageFormSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(60, 'Use até 60 caracteres.'),
  command: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Informe o comando.')
    .max(40, 'Use até 40 caracteres.')
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use letras sem acentos, números, hífen ou sublinhado, sem /.'),
  message: z
    .string()
    .min(1, 'Informe a mensagem.')
    .max(4096, 'Use até 4096 caracteres.')
    .refine((value) => value.trim().length > 0, 'Informe a mensagem.'),
})
export const quickMessageSchema = z.object({
  id: z.uuid(),
  sessionId: z.string(),
  name: z.string(),
  command: z.string(),
  message: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type QuickMessage = z.infer<typeof quickMessageSchema>
export type QuickMessageInput = z.infer<typeof quickMessageFormSchema>

// Only a standalone slash command opens suggestions; URLs and ordinary text stay untouched.
export function quickMessageSearch(draft: string): string | null {
  return /^\/([^\s/]*)$/.exec(draft)?.[1] ?? null
}
export function filterQuickMessages(messages: QuickMessage[], search: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  const query = normalize(search.replace(/^\//, ''))
  return messages.filter((item) => normalize(`${item.command} ${item.name}`).includes(query))
}
