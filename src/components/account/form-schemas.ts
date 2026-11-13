import { z } from 'zod'

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Informe seu nome.').max(100),
  lastName: z.string().trim().min(1, 'Informe seu sobrenome.').max(100),
  email: z.string().trim().pipe(z.email('Informe um email válido.')),
  phone: z.string().regex(/^\+?\d{7,15}$/, 'Informe um telefone válido.'),
})

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe sua senha atual.'),
    password: z.string().min(8, 'Use pelo menos 8 caracteres na nova senha.').max(128),
    confirmPassword: z.string().min(1, 'Confirme sua nova senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  })
