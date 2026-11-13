import { useAtomValue } from 'jotai'

import { userAtom } from '@/atoms/auth'
import AppearanceSettings from '@/components/account/appearance-settings'
import PasswordForm from '@/components/account/password-form'
import ProfileForm from '@/components/account/profile-form'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsPage() {
  const { data: user, isPending, isError, refetch } = useAtomValue(userAtom)

  if (isPending)
    return (
      <div role="status" aria-label="Carregando minha conta" className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  if (isError || !user)
    return (
      <div role="alert" className="space-y-4">
        <p className="text-sm text-muted-foreground">Não foi possível carregar sua conta.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    )

  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Minha conta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie seus dados pessoais, a aparência e a segurança da sua conta.
        </p>
      </header>
      <section
        aria-labelledby="profile-title"
        className="rounded-lg border bg-background p-4 sm:p-6"
      >
        <div className="mb-6">
          <h2 id="profile-title" className="text-lg font-semibold">
            Dados pessoais
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mantenha suas informações de contato atualizadas.
          </p>
        </div>
        <ProfileForm key={user.id} user={user} />
      </section>
      <AppearanceSettings />
      <section
        aria-labelledby="password-title"
        className="rounded-lg border bg-background p-4 sm:p-6"
      >
        <div className="mb-6">
          <h2 id="password-title" className="text-lg font-semibold">
            Alterar senha
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirme sua senha atual e escolha uma nova com pelo menos 8 caracteres.
          </p>
        </div>
        <PasswordForm />
      </section>
    </div>
  )
}
