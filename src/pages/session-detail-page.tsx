'use client'

import { useAtom } from 'jotai'
import { Link, useParams } from 'react-router'
import { getSessionByIdAtom } from '@/atoms/session'
import { Button } from '@/components/ui/button'
import DeleteSession from './session-detail/components/delete-session'
import SessionConfigCard from './session-detail/components/session-config-card'
import SessionSettings from './session-detail/components/session-settings'
import SessionWebhooks from './session-detail/components/session-webhooks'
import TestMessage from './session-detail/components/test-message'
import LoadingSession from './session-detail/loading'

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId

  const [{ data, isPending, isError, refetch }] = useAtom(getSessionByIdAtom(sessionId ?? ''))

  if (!sessionId) return <LoadingSession />
  if (isPending) return <LoadingSession />
  if (isError || !data)
    return (
      <div role="alert" className="flex flex-col items-start gap-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Falha ao carregar os detalhes da sessão.</h1>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void refetch()}>Tentar novamente</Button>
          <Button asChild variant="outline">
            <Link to="/sessions">Voltar para sessões</Link>
          </Button>
        </div>
      </div>
    )

  const session = data

  return (
    <div className="flex flex-col gap-6 items-start justify-center h-full w-full max-w-5xl ">
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Detalhes da sessão</h1>
        <Button asChild variant="ghost">
          <Link to="/sessions">Voltar para sessões</Link>
        </Button>
      </div>
      <div className="w-full">
        <SessionConfigCard session={session} />
      </div>

      <div className="w-full border rounded-lg p-4">
        <TestMessage session={session} />
      </div>

      <div className="w-full border rounded-lg p-4">
        <SessionSettings session={session} />
      </div>

      <div className="w-full border rounded-lg p-4">
        <SessionWebhooks session={session} />
      </div>

      <div className="w-full border rounded-lg p-4">
        <DeleteSession session={session} />
      </div>
    </div>
  )
}
