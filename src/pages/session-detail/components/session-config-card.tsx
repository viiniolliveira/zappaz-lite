'use client'

import { useAtom } from 'jotai'
import { Loader2Icon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { updateSessionAtom } from '@/atoms/session'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import CopyButton from '@/components/ui/CopyButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SessionSchema } from '@/services/types'

function EditSessionNameModal({ session }: { session: SessionSchema }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(session.displayName)
  const [{ isPending, mutate: updateSession }] = useAtom(updateSessionAtom)

  const handleSave = () => {
    if (!name.trim()) return

    updateSession(
      { id: session.id, req: { displayName: name } },
      {
        onSuccess: () => {
          setOpen(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button aria-label="Editar nome da sessão" variant="ghost" size="icon">
          <PencilIcon className="w-4 h-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Nome da Sessão</DialogTitle>
          <DialogDescription>Escolha um nome para identificar esta sessão.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome da Sessão</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Minha Sessão"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending || !name.trim()}>
            {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SessionConfigCard({ session }: { session: SessionSchema }) {
  return (
    <div className="flex w-full min-w-0 items-center p-4 border rounded-lg gap-3 sm:w-fit hover:bg-secondary/50 dark:hover:bg-secondary/50">
      <Avatar className="size-12 border">
        {session.status === 'open' && session.profilePictureUrl && (
          <AvatarImage src={session.profilePictureUrl} alt={session.displayName} />
        )}
        <AvatarFallback>{session?.displayName?.slice(0, 2).toUpperCase() || '??'}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex gap-2 items-center">
          <h2 className="break-words font-semibold leading-snug tracking-tight">
            {session?.displayName}
          </h2>
          <EditSessionNameModal session={session} />
        </div>
        <p className="break-all text-sm text-muted-foreground">ID: {session?.id}</p>
      </div>
      <CopyButton copyValue={session.id} variant="ghost" />
    </div>
  )
}
