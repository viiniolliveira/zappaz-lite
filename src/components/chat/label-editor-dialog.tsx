import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { apiChatConversationsAtom } from '@/atoms/chat-cache'
import { chatLabelMutationAtom, chatLabelsAtom, manageChatLabelAtom } from '@/atoms/chat-labels'
import { chatLabelManagerAtom, chatLabelTargetAtom, chatSessionIdAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type ConversationLabelsInput, conversationLabelsFormSchema } from '@/lib/chat/labels'
import type { ChatConversation } from '@/lib/chat/types'

function EditorForm({ conversation }: { conversation: ChatConversation }) {
  const labels = useAtomValue(chatLabelsAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  const mutate = useSetAtom(manageChatLabelAtom)
  const setManager = useSetAtom(chatLabelManagerAtom)
  const [target, setTarget] = useAtom(chatLabelTargetAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const form = useForm<ConversationLabelsInput>({
    resolver: zodResolver(conversationLabelsFormSchema),
    defaultValues: { labelIds: conversation.labelIds },
  })
  const ids = form.watch('labelIds')
  const changed =
    ids.length !== conversation.labelIds.length ||
    ids.some((id) => !conversation.labelIds.includes(id))
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async ({ labelIds }) => {
        const saved = await mutate({ action: 'link', conversationId: conversation.id, labelIds })
        if (saved && sessionId === conversation.sessionId && target === conversation.id)
          setTarget((current) => (current === conversation.id ? null : current))
      })}
    >
      <div className="max-h-[min(55vh,28rem)] overflow-y-auto">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setManager('create')}
          className="mb-2 h-auto w-full justify-start gap-4 px-3 py-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Plus aria-hidden="true" className="size-5" />
          </span>
          Criar etiqueta
        </Button>
        {labels.isPending ? (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Carregando etiquetas…
          </p>
        ) : labels.error ? (
          <div role="alert" className="p-3 text-sm">
            <p>{labels.error.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void labels.refetch()
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : !labels.data?.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            Crie sua primeira etiqueta para organizar esta conversa.
          </p>
        ) : (
          <fieldset disabled={pending} className="space-y-1">
            <legend className="sr-only">Etiquetas disponíveis</legend>
            {labels.data.map((label) => (
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-4 rounded-xl px-3 py-4 hover:bg-muted/60"
                title={label.description}
              >
                <span className="flex size-9 shrink-0 items-center justify-center">
                  <span className="size-3 rounded-full" style={{ backgroundColor: label.color }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                <input
                  type="checkbox"
                  value={label.id}
                  {...form.register('labelIds')}
                  className="size-4 shrink-0 accent-primary"
                />
              </label>
            ))}
          </fieldset>
        )}
      </div>
      {form.formState.errors.labelIds && (
        <p role="alert" className="text-sm text-destructive">
          Selecione até 100 etiquetas.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setTarget(null)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !changed || !labels.isSuccess}>
          {pending ? 'Salvando…' : 'Confirmar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function LabelEditorDialog() {
  const [target, setTarget] = useAtom(chatLabelTargetAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  const conversation = useAtomValue(apiChatConversationsAtom).find((item) => item.id === target)
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !pending) setTarget(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher etiquetas</DialogTitle>
          <DialogDescription>
            {conversation?.displayName ?? 'Conversa selecionada'}
          </DialogDescription>
        </DialogHeader>
        {conversation ? (
          <EditorForm
            key={`${conversation.sessionId}/${conversation.id}`}
            conversation={conversation}
          />
        ) : (
          <p role="alert" className="text-sm text-muted-foreground">
            Esta conversa não está mais disponível.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
