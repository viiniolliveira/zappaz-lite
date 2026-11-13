'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useAtom, useSetAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { useRef } from 'react'

import { connectSessionAtom, createSessionAtom, sessionKeys } from '@/atoms/session'
import {
  connectSessionIdAtom,
  connectSessionQrCodeAtom,
  isConnectSessionModalOpenAtom,
  isCreateSessionModalOpenAtom,
} from '@/atoms/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { DEFAULT_SESSION_CONFIG } from '@/services/session'

export function CreateSessionModal() {
  const triggerRef = useRef<HTMLElement | null>(null)
  const openingConnection = useRef(false)
  const [open, setOpen] = useAtom(isCreateSessionModalOpenAtom)
  const [{ isPending, mutate: createSession }] = useAtom(createSessionAtom)
  const queryClient = useQueryClient()
  const [{ mutate: connectSession }] = useAtom(connectSessionAtom)
  const setConnectSessionId = useSetAtom(connectSessionIdAtom)
  const setConnectQrCode = useSetAtom(connectSessionQrCodeAtom)
  const setConnectModalOpen = useSetAtom(isConnectSessionModalOpenAtom)

  const handleCreateSession = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (isPending) return
    const formData = new FormData(e.currentTarget)
    const sessionName = formData.get('session-name') as string

    createSession(
      {
        displayName: sessionName,
        config: {
          ...DEFAULT_SESSION_CONFIG,
          syncFullHistory: formData.get('sync-full-history') === 'on',
        },
      },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: sessionKeys.list() })
          setConnectSessionId(session.id)
          setConnectQrCode(null)
          openingConnection.current = true
          setOpen(false)
          setConnectModalOpen(true)
          connectSession(session.id, {
            onSuccess: (data) => {
              if (data.qrCodeBase64) setConnectQrCode(data.qrCodeBase64)
            },
          })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-106.25"
        onOpenAutoFocus={() => {
          openingConnection.current = false
          triggerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={(event) => {
          if (openingConnection.current) {
            event.preventDefault()
            return
          }
          if (triggerRef.current?.isConnected) {
            event.preventDefault()
            triggerRef.current.focus()
          }
        }}
      >
        <form onSubmit={handleCreateSession} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Criar Sessão</DialogTitle>
            <DialogDescription>
              Crie uma nova sessão para conectar seu WhatsApp e começar as usar os serviços da
              Zappaz.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="flex items-center justify-center my-6">
              <Avatar className="size-32 rounded-sm border">
                <AvatarImage asChild src="/assets/new-session.webp">
                  <img src="/assets/new-session.webp" alt="New Session" width={128} height={128} />
                </AvatarImage>
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
            </div>
            <div className="grid gap-3">
              <Label htmlFor="session-name-1">Nome da Sessão</Label>
              <Input
                id="session-name-1"
                name="session-name"
                placeholder="Nome da sessão"
                required
              />
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="create-session-sync">Sincronizar histórico do WhatsApp</Label>
                <Switch
                  id="create-session-sync"
                  name="sync-full-history"
                  defaultChecked={false}
                  disabled={isPending}
                  aria-describedby="create-session-sync-description"
                />
              </div>
              <p id="create-session-sync-description" className="text-xs text-muted-foreground">
                Importa o histórico disponibilizado pelo WhatsApp em segundo plano após conectar.
                Não adiciona pessoas à agenda automaticamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button className="w-30" type="submit" disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin mr-2" /> : 'Criar Sessão'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
