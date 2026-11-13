import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useForm } from 'react-hook-form'
import {
  applyChatBulkLabelsAtom,
  chatBulkLabelConversationsAtom,
  chatBulkLabelsMutationAtom,
  chatLabelsAtom,
} from '@/atoms/chat-labels'
import {
  chatBulkLabelsOpenAtom,
  chatConversationSelectionAtom,
  chatSessionIdAtom,
} from '@/atoms/ui'
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
  type BulkLabelsInput,
  bulkLabelsFormSchema,
  type ChatLabel,
  getBulkLabelState,
} from '@/lib/chat/labels'
import type { ConversationDTO } from '@/lib/chat/schemas'

function BulkLabelsForm({
  conversations,
  labels,
}: {
  conversations: ConversationDTO[]
  labels: ChatLabel[]
}) {
  const apply = useSetAtom(applyChatBulkLabelsAtom)
  const setOpen = useSetAtom(chatBulkLabelsOpenAtom)
  const pending = useAtomValue(chatBulkLabelsMutationAtom).isPending
  const form = useForm<BulkLabelsInput>({
    resolver: zodResolver(bulkLabelsFormSchema),
    defaultValues: { changes: {} },
  })
  const changes = form.watch('changes')
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        await apply(input)
      })}
    >
      {!labels.length ? (
        <p className="text-sm text-muted-foreground">
          Crie uma etiqueta em “Gerenciar etiquetas” antes de alterar as conversas.
        </p>
      ) : (
        <fieldset disabled={pending} className="max-h-[min(55vh,28rem)] space-y-1 overflow-y-auto">
          <legend className="sr-only">Etiquetas disponíveis</legend>
          {labels.map((label) => {
            const initial = getBulkLabelState(conversations, label.id)
            const state = Object.hasOwn(changes, label.id) ? changes[label.id] : initial
            return (
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-4 px-3 py-4 hover:bg-muted/60"
                title={label.description}
              >
                <span className="flex size-9 shrink-0 items-center justify-center">
                  <span className="size-3 rounded-full" style={{ backgroundColor: label.color }} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                <input
                  type="checkbox"
                  checked={state === true}
                  aria-checked={state === 'indeterminate' ? 'mixed' : state}
                  ref={(input) => {
                    if (input) input.indeterminate = state === 'indeterminate'
                  }}
                  onChange={(event) => {
                    const next = { ...changes }
                    if (event.target.checked === initial) delete next[label.id]
                    else next[label.id] = event.target.checked
                    form.setValue('changes', next, { shouldDirty: true, shouldValidate: true })
                  }}
                  className="size-4 shrink-0 accent-primary"
                />
              </label>
            )
          })}
        </fieldset>
      )}
      {form.formState.errors.changes && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível validar a seleção de etiquetas.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !Object.keys(changes).length}>
          {pending ? 'Salvando…' : 'Confirmar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function BulkLabelsContent() {
  const labels = useAtomValue(chatLabelsAtom)
  const conversations = useAtomValue(chatBulkLabelConversationsAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const selection = useAtomValue(chatConversationSelectionAtom)
  if (labels.isPending || conversations.isPending || conversations.isFetching)
    return <p role="status">Carregando etiquetas das conversas…</p>
  if (!labels.isSuccess || !conversations.isSuccess)
    return (
      <div role="alert" className="space-y-3">
        <p>{labels.error?.message ?? conversations.error?.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            if (labels.error) void labels.refetch()
            if (conversations.error) void conversations.refetch()
          }}
        >
          Tentar novamente
        </Button>
      </div>
    )
  return (
    <BulkLabelsForm
      key={`${sessionId}/${selection?.ids.join(',')}`}
      conversations={conversations.data}
      labels={labels.data}
    />
  )
}

export default function BulkLabelsDialog() {
  const [open, setOpen] = useAtom(chatBulkLabelsOpenAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const selection = useAtomValue(chatConversationSelectionAtom)
  const pending = useAtomValue(chatBulkLabelsMutationAtom).isPending
  return (
    <Dialog
      open={open && !!sessionId && selection?.sessionId === sessionId && !!selection.ids.length}
      onOpenChange={(value) => {
        if (!pending) setOpen(value)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolher etiquetas</DialogTitle>
          <DialogDescription>
            {selection?.ids.length ?? 0} conversas selecionadas. Um traço indica etiquetas presentes
            em apenas algumas conversas. Somente as etiquetas alteradas serão aplicadas.
          </DialogDescription>
        </DialogHeader>
        {open && <BulkLabelsContent />}
      </DialogContent>
    </Dialog>
  )
}
