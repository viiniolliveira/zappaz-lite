import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { applyChatMessagesAtom } from '@/atoms/chat-cache'
import { editChatMessageMutationAtom } from '@/atoms/chat-message-actions'
import { chatEditMessageAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import type { ChatConversation, ChatMessage } from '@/lib/chat/types'
import { editChatMessageSchema } from '@/services/chat'
import MessageFormattedText from './message-formatted-text'
import MessageFrame from './message-frame'
import MessageMetadata from './message-metadata'
import MessageReply from './message-reply'

export default function EditMessageDialog({
  conversation,
}: {
  conversation: ChatConversation | undefined
}) {
  const [target, setTarget] = useAtom(chatEditMessageAtom)
  const sessionId = conversation?.sessionId
  const conversationId = conversation?.id
  useEffect(
    () => () => {
      setTarget((selected) =>
        selected?.sessionId === sessionId && selected?.conversationId === conversationId
          ? null
          : selected,
      )
    },
    [sessionId, conversationId, setTarget],
  )
  if (!target || target.sessionId !== sessionId || target.conversationId !== conversationId)
    return null
  const current = conversation?.messages.find((message) => message.id === target.id) ?? target
  return (
    <EditMessageForm
      key={target.id}
      message={current}
      onClose={() => setTarget((selected) => (selected?.id === target.id ? null : selected))}
    />
  )
}

function EditMessageForm({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const original = useRef(message).current
  const mutation = useAtomValue(editChatMessageMutationAtom)
  const applyMessages = useSetAtom(applyChatMessagesAtom)
  const form = useForm<z.infer<typeof editChatMessageSchema>>({
    resolver: zodResolver(editChatMessageSchema),
    defaultValues: { text: original.text ?? '' },
    mode: 'onChange',
  })
  const submitting = form.formState.isSubmitting
  const text = form.watch('text')
  const unavailable = !!message.deletedAt
  async function save(body: z.infer<typeof editChatMessageSchema>) {
    if (submitting || unavailable || body.text === original.text) return
    try {
      const updated = await mutation.mutateAsync({ ...original, text: body.text })
      applyMessages([updated])
      onClose()
    } catch {
      // The mutation reports the error; keep the draft available for correction.
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={!submitting}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.setFocus('text')
        }}
      >
        <DialogHeader className="px-6 py-5 text-left">
          <DialogTitle>Editar mensagem</DialogTitle>
          <DialogDescription className="sr-only">
            Altere o texto da mensagem. A citação original será preservada.
          </DialogDescription>
        </DialogHeader>
        <section
          className="flex min-h-48 items-center bg-muted/30 px-6 py-8 sm:min-h-64"
          aria-label="Prévia da mensagem original"
        >
          <ul className="max-h-64 w-full overflow-y-auto">
            <MessageFrame id={`edit-preview-${original.id}`} fromMe>
              <MessageReply reply={original.replyTo} />
              <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                <MessageFormattedText text={original.text ?? ''} />
              </p>
              <MessageMetadata message={original} />
            </MessageFrame>
          </ul>
        </section>
        <form onSubmit={form.handleSubmit(save)} className="space-y-2 p-5">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={`edit-text-${original.id}`} className="sr-only">
                Texto da mensagem
              </label>
              <Textarea
                {...form.register('text')}
                id={`edit-text-${original.id}`}
                rows={2}
                maxLength={65536}
                disabled={submitting || unavailable}
                aria-invalid={!!form.formState.errors.text}
                aria-describedby={
                  form.formState.errors.text ? `edit-error-${original.id}` : undefined
                }
                className="max-h-40 min-h-20 resize-none border-0 border-b-2 rounded-none bg-transparent px-1 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    void form.handleSubmit(save)()
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              className="mb-2 size-12 shrink-0 rounded-full"
              disabled={
                submitting || unavailable || !form.formState.isValid || text === original.text
              }
              aria-label={submitting ? 'Salvando edição' : 'Salvar edição'}
            >
              {submitting ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-6" aria-hidden="true" />
              )}
            </Button>
          </div>
          {form.formState.errors.text && (
            <p id={`edit-error-${original.id}`} role="alert" className="text-sm text-destructive">
              {form.formState.errors.text.message}
            </p>
          )}
          {unavailable && (
            <p role="alert" className="text-sm text-destructive">
              Esta mensagem foi removida e não pode mais ser editada.
            </p>
          )}
          {submitting && (
            <p role="status" className="sr-only">
              Salvando edição…
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
