import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { chatDeleteMutationAtom, deleteChatConversationsAtom } from '@/atoms/chat-delete'
import { chatDeleteConversationIdsAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ChatConversation } from '@/lib/chat/types'

export default function DeleteConversationDialog({
  conversations,
}: {
  conversations: ChatConversation[]
}) {
  const [targetIds, setTargets] = useAtom(chatDeleteConversationIdsAtom)
  const remove = useSetAtom(deleteChatConversationsAtom)
  const { isPending } = useAtomValue(chatDeleteMutationAtom)
  const multiple = targetIds.length > 1
  return (
    <Dialog
      open={targetIds.length > 0}
      onOpenChange={(open) => {
        if (!open && !isPending) setTargets([])
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {multiple ? `Excluir ${targetIds.length} conversas?` : 'Excluir conversa?'}
          </DialogTitle>
          <DialogDescription>
            O histórico e todas as mídias{' '}
            {multiple
              ? `das ${targetIds.length} conversas selecionadas`
              : conversations[0]
                ? `de ${conversations[0].displayName}`
                : 'da conversa selecionada'}{' '}
            serão excluídos permanentemente do Zappaz.{' '}
            {multiple ? 'Os contatos serão mantidos' : 'O contato será mantido'} e nada será apagado
            no WhatsApp. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setTargets([])}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => {
              void remove(targetIds)
            }}
          >
            {isPending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {isPending ? 'Excluindo…' : multiple ? 'Excluir selecionadas' : 'Excluir conversa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
