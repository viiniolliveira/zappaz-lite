import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { chatContactMutationAtom, removeChatContactAtom } from '@/atoms/chat-contacts'
import { chatDeleteContactAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function DeleteContactDialog() {
  const [target, setTarget] = useAtom(chatDeleteContactAtom)
  const remove = useSetAtom(removeChatContactAtom)
  const { isPending } = useAtomValue(chatContactMutationAtom)
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !isPending) setTarget(null)
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Excluir contato?</DialogTitle>
          <DialogDescription>
            {target?.displayName} será removido da agenda do Zappaz, incluindo o nome local, email e
            anotações. A conversa, as mensagens e as mídias serão mantidas. Nada será alterado no
            WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setTarget(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              void remove()
            }}
          >
            {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isPending ? 'Excluindo…' : 'Excluir contato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
