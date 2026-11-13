import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Copy, Pencil, Reply, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { applyChatMessagesAtom } from '@/atoms/chat-cache'
import { deleteChatMessageMutationAtom } from '@/atoms/chat-message-actions'
import { chatEditMessageAtom, chatRepliesAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { ChatMessage } from '@/lib/chat/types'

export default function MessageActions({ message }: { message: ChatMessage }) {
  const setReplies = useSetAtom(chatRepliesAtom)
  const setEditMessage = useSetAtom(chatEditMessageAtom)
  const applyMessages = useSetAtom(applyChatMessagesAtom)
  const mutation = useAtomValue(deleteChatMessageMutationAtom)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  async function remove() {
    if (deleting) return
    setDeleting(true)
    try {
      const deleted = await mutation.mutateAsync(message)
      applyMessages([deleted])
      setConfirm(false)
    } catch {
      /* The mutation displays the error and preserves the message. */
    } finally {
      setDeleting(false)
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Ações da mensagem"
            className="absolute right-1 top-1 z-10 size-7 rounded-full bg-card/95 text-muted-foreground shadow-sm transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0"
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Ações da mensagem">
          <DropdownMenuItem
            onClick={() =>
              setReplies((previous) => ({
                ...previous,
                [`${message.sessionId}/${message.conversationId}`]: message,
              }))
            }
          >
            <Reply aria-hidden="true" />
            Responder
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!message.text}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message.text ?? '')
                toast.success('Mensagem copiada')
              } catch {
                toast.error('Não foi possível copiar a mensagem')
              }
            }}
          >
            <Copy aria-hidden="true" />
            Copiar mensagem
          </DropdownMenuItem>
          {message.fromMe &&
            message.type === 'text' &&
            !message.interactive &&
            !message.deletedAt && (
              <DropdownMenuItem onClick={() => setEditMessage(message)}>
                <Pencil aria-hidden="true" />
                Editar mensagem
              </DropdownMenuItem>
            )}
          {message.fromMe && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden="true" />
              Apagar para todos
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!deleting) setConfirm(open)
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Apagar mensagem para todos?</DialogTitle>
            <DialogDescription>
              A exclusão será solicitada ao WhatsApp para você e para o destinatário. Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                void remove()
              }}
            >
              {deleting ? 'Apagando…' : 'Apagar para todos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
