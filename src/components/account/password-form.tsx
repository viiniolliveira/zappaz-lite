import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue } from 'jotai'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { changePasswordAtom } from '@/atoms/auth'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { PasswordInput } from '@/components/ui/password-input'
import { Spinner } from '@/components/ui/spinner'
import { passwordSchema } from './form-schemas'

type PasswordValues = z.infer<typeof passwordSchema>

export default function PasswordForm() {
  const { mutateAsync, isPending } = useAtomValue(changePasswordAtom)
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  })

  async function onSubmit({ currentPassword, password }: PasswordValues) {
    try {
      await mutateAsync({ currentPassword, password })
      form.reset()
    } catch {
      // O átomo apresenta o erro da operação ao usuário.
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={isPending} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <legend className="sr-only">Alterar senha</legend>
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Senha atual</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nova senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
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
                <FormLabel>Confirmar nova senha</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <Button type="submit" disabled={isPending || !form.formState.isDirty}>
          {isPending && <Spinner aria-hidden="true" />}
          {isPending ? 'Alterando...' : 'Alterar senha'}
        </Button>
      </form>
    </Form>
  )
}
