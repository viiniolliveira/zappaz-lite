import { useAtomValue } from 'jotai'
import { Navigate, Outlet } from 'react-router'
import { userAtom } from '@/atoms/auth'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ApiError } from '@/lib/api-error'

export function AdminLayout() {
  const { data: user, isPending, isError, error, refetch } = useAtomValue(userAtom)

  if (isPending)
    return (
      <div role="status" className="flex min-h-40 items-center justify-center">
        <Spinner aria-label="Verificando permissões" />
      </div>
    )
  if (isError && error instanceof ApiError && error.status === 401)
    return <Navigate to="/sign-in" replace />
  if (isError || !user)
    return (
      <div role="alert" className="space-y-4">
        <p className="text-sm text-muted-foreground">Não foi possível verificar suas permissões.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    )
  if (user.role !== 'ADMIN') return <Navigate to="/account" replace />
  return <Outlet />
}
