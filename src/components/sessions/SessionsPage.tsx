'use client'

import { useAtom } from 'jotai'
import { sessionsAtom } from '@/atoms/session'
import { ConnectSessionModal } from '@/components/sessions/connect-session-modal'
import CreateSessionCard from '@/components/sessions/create-session-card'
import { CreateSessionModal } from '@/components/sessions/create-session-modal'
import SessionCard from '@/components/sessions/session-card'
import SessionSkeletonCards from '@/components/sessions/skeleton-cards'

export default function SessionsPage() {
  const [{ data, isPending }] = useAtom(sessionsAtom)

  if (isPending) {
    return <SessionSkeletonCards />
  }

  const sessions = data?.data || []

  return (
    <>
      <div className="flex w-full flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sessões</h1>
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
          <CreateSessionCard />
        </div>
      </div>
      <ConnectSessionModal />
      <CreateSessionModal />
    </>
  )
}
