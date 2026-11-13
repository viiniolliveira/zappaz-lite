'use client'

import { useAtom, useSetAtom } from 'jotai'
import { Loader2Icon, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { removeSessionAtom } from '@/atoms/session'
import { clearChatSessionDraftsAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { SessionSchema } from '@/services/types'

export default function DeleteSession({ session }: { session: SessionSchema }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const [{ isPending, mutate: removeSession }] = useAtom(removeSessionAtom)
  const clearDrafts = useSetAtom(clearChatSessionDraftsAtom)

  const handleDelete = () => {
    if (isPending) return
    removeSession(session.id, {
      onSuccess: () => {
        clearDrafts(session.id)
        setOpen(false)
        navigate('/sessions')
      },
    })
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4">
        <h2 className="font-semibold text-lg">Deletar Sessão</h2>
        <div className="border border-destructive rounded-lg p-4 flex max-w-140 gap-2">
          <div>
            <TriangleAlert className="text-destructive" />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">
              Esta ação exclui permanentemente a sessão, conversas, mensagens, contatos e mídias
              armazenadas. Não pode ser desfeita.
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Deletar Sessão</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Você tem certeza absoluta?</DialogTitle>
              <DialogDescription>
                Esta ação não pode ser desfeita. Isso irá deletar permanentemente a sessão &quot;
                {session?.displayName}&quot; e remover todos os dados associados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
                {isPending ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
                Deletar Sessão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
