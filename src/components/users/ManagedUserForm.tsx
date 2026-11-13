import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { createManagedUserAtom, updateManagedUserAtom } from '@/atoms/users'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { PhoneInput } from '@/components/ui/phone-input/phone-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { User } from '@/services/types'

type ManagedUserFormMode = 'create' | 'edit'

interface ManagedUserFormProps {
  mode: ManagedUserFormMode
  onSuccess: () => void
  user?: User | null
}

function createUserSchema(mode: ManagedUserFormMode) {
  const phone = z.string().regex(/^\+?\d{7,15}$/, 'Telefone inválido')
  const password =
    mode === 'create'
      ? z.string().min(8, 'Use pelo menos 8 caracteres.').max(128)
      : z
          .union([z.literal(''), z.string().min(8, 'Use pelo menos 8 caracteres.').max(128)])
          .optional()
  const confirmPassword =
    mode === 'create'
      ? z.string().min(1, 'A confirmação de senha é obrigatória')
      : z.string().optional()

  return z
    .object({
      firstName: z.string().trim().min(1, 'O nome é obrigatório').max(100),
      lastName: z.string().trim().min(1, 'O sobrenome é obrigatório').max(100),
      email: z.email('Insira um email válido.'),
      phone: z.union([z.literal(''), phone]),
      password,
      confirmPassword,
      role: z.enum(['ADMIN', 'USER']),
    })
    .refine(
      (data) => {
        if (!data.password && !data.confirmPassword) return true
        return data.password === data.confirmPassword
      },
      {
        message: 'As senhas não coincidem',
        path: ['confirmPassword'],
      },
    )
}

type ManagedUserFormValues = z.infer<ReturnType<typeof createUserSchema>>

export default function ManagedUserForm({ mode, onSuccess, user }: ManagedUserFormProps) {
  const [{ mutateAsync: createUser, isPending: isCreating }] = useAtom(createManagedUserAtom)
  const [{ mutateAsync: updateUser, isPending: isUpdating }] = useAtom(updateManagedUserAtom)
  const isPending = isCreating || isUpdating

  const form = useForm<ManagedUserFormValues>({
    resolver: zodResolver(createUserSchema(mode)),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      role: 'USER',
    },
  })

  useEffect(() => {
    form.reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ? `+${user.phone}` : '',
      password: '',
      confirmPassword: '',
      role: user?.role ?? 'USER',
    })
  }, [form, user])

  const onSubmit = async (data: ManagedUserFormValues) => {
    try {
      if (mode === 'create') {
        if (!data.password) {
          form.setError('password', { message: 'A senha é obrigatória' })
          return
        }
        await createUser({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone || null,
          password: data.password,
        })
      } else if (user) {
        await updateUser({
          userId: user.id,
          req: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone || null,
            password: data.password || undefined,
            role: data.role,
          },
        })
      }

      onSuccess()
    } catch {
      // A mutação já exibe a mensagem de erro ao usuário.
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Nome" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sobrenome</FormLabel>
              <FormControl>
                <Input placeholder="Sobrenome" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="Email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone (opcional)</FormLabel>
              <FormControl>
                <PhoneInput
                  placeholder="00 00000-0000"
                  {...field}
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {mode === 'edit' && (
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Perfil</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um perfil" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="USER">Usuário</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{mode === 'create' ? 'Senha' : 'Nova senha'}</FormLabel>
              <FormControl>
                <PasswordInput placeholder="Senha" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmação de senha</FormLabel>
              <FormControl>
                <PasswordInput placeholder="Confirmação de senha" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full"
          disabled={isPending || (mode === 'edit' && !form.formState.isDirty)}
        >
          {isPending ? (
            <>
              <span>{mode === 'create' ? 'Criando...' : 'Atualizando...'}</span>
              <Loader2Icon className="ml-2 size-4 animate-spin" />
            </>
          ) : mode === 'create' ? (
            'Criar usuário'
          ) : (
            'Salvar alterações'
          )}
        </Button>
      </form>
    </Form>
  )
}
