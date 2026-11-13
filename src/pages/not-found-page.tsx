import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <Button asChild variant="outline">
        <Link to="/">Voltar para o início</Link>
      </Button>
    </main>
  )
}
