import UsersTable from '@/components/users/UsersTable'

export default function UsersPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie os usuários e os perfis de acesso ao sistema.
        </p>
      </header>
      <UsersTable />
    </div>
  )
}
