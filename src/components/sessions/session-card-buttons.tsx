import { useAtom, useSetAtom, type WritableAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { connectSessionAtom, logoutSessionAtom } from '@/atoms/session'

import {
  connectSessionIdAtom,
  connectSessionQrCodeAtom,
  isConnectSessionModalOpenAtom,
} from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import type { ConnectSession, SessionSchema } from '@/services/types'

export function LogOutButton({ sessionId }: { sessionId: string }) {
  const [{ isPending, variables, mutate: logoutSession }] = useAtom(logoutSessionAtom)

  const isMutatingThis = isPending && variables === sessionId

  const handleLogoutSession = () => {
    if (isPending) return
    logoutSession(sessionId)
  }

  return (
    <Button
      onClick={handleLogoutSession}
      disabled={isPending}
      variant="destructive"
      className="w-32"
    >
      {isMutatingThis ? <Loader2Icon className="animate-spin mr-2" /> : 'Desconectar'}
    </Button>
  )
}

export default function SessionCardButtons({ session }: { session: SessionSchema }) {
  const [{ isPending, variables, mutate: connectSession }] = useAtom(connectSessionAtom)
  const setConnectSessionId = useSetAtom(
    connectSessionIdAtom as WritableAtom<string | null, [string | null], void>,
  )
  const setIsConnectModalOpen = useSetAtom(isConnectSessionModalOpenAtom)
  const setConnectQrCode = useSetAtom(
    connectSessionQrCodeAtom as WritableAtom<string | null, [string | null], void>,
  )

  const isMutatingThis = isPending && variables === session.id

  const handleConnectSession = () => {
    // Open modal immediately for better UX
    setConnectSessionId(session.id)
    setIsConnectModalOpen(true)
    setConnectQrCode(null) // Clear previous QR

    // Trigger connect mutation in background
    connectSession(session.id, {
      onSuccess: (data: ConnectSession) => {
        if (data?.qrCodeBase64) {
          setConnectQrCode(data.qrCodeBase64)
        }
      },
    })
  }

  if (session.status !== 'open' && session.enabled) {
    return (
      <Button
        onClick={handleConnectSession}
        variant="outline"
        className="w-32 border-primary text-foreground"
        disabled={isMutatingThis}
      >
        {isMutatingThis ? <Loader2Icon className="animate-spin" /> : 'Conectar'}
      </Button>
    )
  }

  if (session.status === 'open') return <LogOutButton sessionId={session.id} />

  return null
}
