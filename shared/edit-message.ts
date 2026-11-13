import { z } from 'zod'

export const EditMessageSchema = z.strictObject({
  text: z
    .string()
    .min(1, 'Informe o texto da mensagem')
    .max(65536, 'Use até 65.536 caracteres')
    .refine((value) => value.trim().length > 0, 'Informe o texto da mensagem')
    .describe('Novo texto completo da mensagem, preservando espaços e quebras de linha.'),
})
