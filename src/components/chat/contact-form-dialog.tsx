import { useAtom, useAtomValue } from 'jotai'
import { chatContactMutationAtom } from '@/atoms/chat-contacts'
import { chatContactFormAtom } from '@/atoms/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ContactForm from './contact-form'

export default function ContactFormDialog() {
  const [target, setTarget] = useAtom(chatContactFormAtom)
  const { isPending } = useAtomValue(chatContactMutationAtom)
  const open = target?.surface === 'dialog'
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && open && !isPending) setTarget(null)
      }}
    >
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{target?.saved ? 'Editar contato' : 'Adicionar contato'}</DialogTitle>
          <DialogDescription>
            Salvo somente na agenda desta sessão no Zappaz. Nada será alterado no WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {open && <ContactForm key={target.contactId ?? 'new'} />}
      </DialogContent>
    </Dialog>
  )
}
