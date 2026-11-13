'use client'

import { useAtom, useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { connectSessionAtom, connectSessionQueryAtom } from '@/atoms/session'
import {
  connectSessionIdAtom,
  connectSessionQrCodeAtom,
  isConnectSessionModalOpenAtom,
} from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ConnectSteps from './connect-steps'

function ConnectSessionContent({ sessionId }: { sessionId: string }) {
  const [{ data, error: queryError }] = useAtom(connectSessionQueryAtom)
  const [{ isPending, error, variables, mutate: connectSession }] = useAtom(connectSessionAtom)
  const [, setConnectModalOpen] = useAtom(isConnectSessionModalOpenAtom)
  const [persistentQr, setPersistentQr] = useAtom(connectSessionQrCodeAtom)

  const status = data?.status

  // We should only display the QR code when the connection mutation has finished
  // and we actually have a persistent QR string.
  const qr = data ? data.qrCodeBase64 : persistentQr
  const showQr = qr && !isPending
  const connectionError = (variables === sessionId ? error : null) ?? queryError

  useEffect(() => {
    // If we've connected successfully, close the modal
    if (status === 'open') {
      setConnectModalOpen(false)
    }
  }, [status, setConnectModalOpen])

  return (
    <div className="flex items-center sm:justify-between justify-center my-2 flex-wrap-reverse">
      <div className="flex flex-col space-y-6 mt-6">
        <DialogHeader>
          <DialogTitle className="hidden sm:flex">Etapas para conectar</DialogTitle>
        </DialogHeader>
        <ConnectSteps />
      </div>
      <div className="flex flex-col items-center overflow-hidden rounded-lg">
        {connectionError && !isPending ? (
          <div role="alert" className="flex max-w-70 flex-col items-center gap-3 p-4 text-center">
            <p className="text-sm">Não foi possível conectar a sessão.</p>
            <p className="text-xs text-muted-foreground">{connectionError.message}</p>
            <Button
              onClick={() => {
                setPersistentQr(null)
                connectSession(sessionId, {
                  onSuccess: (result) => setPersistentQr(result.qrCodeBase64 || null),
                })
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <img
            src={showQr ? `data:image/png;base64,${qr}` : '/assets/qr-code-animation.svg'}
            alt={showQr ? 'Escaneie o QR Code com o WhatsApp' : 'Aguardando QR Code'}
            className={showQr ? 'scale-100 size-70' : 'scale-120 size-70'}
          />
        )}
      </div>
    </div>
  )
}

export function ConnectSessionModal() {
  const [isOpen, setIsOpen] = useAtom(isConnectSessionModalOpenAtom)
  const sessionId = useAtomValue(connectSessionIdAtom)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-180">
        {sessionId ? <ConnectSessionContent sessionId={sessionId} /> : null}
      </DialogContent>
    </Dialog>
  )
}
