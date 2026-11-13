import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import {
  manageQuickMessageAtom,
  quickMessageMutationAtom,
  quickMessagesAtom,
} from '@/atoms/quick-messages'
import { chatQuickMessageManagerAtom, chatSessionIdAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useDebounce } from '@/hooks/use-debounce'
import {
  filterQuickMessages,
  type QuickMessage,
  type QuickMessageInput,
  quickMessageFormSchema,
} from '@/lib/chat/quick-messages'

function QuickMessageForm({
  message,
  onBack,
}: {
  message: QuickMessage | null
  onBack: () => void
}) {
  const mutate = useSetAtom(manageQuickMessageAtom)
  const pending = useAtomValue(quickMessageMutationAtom).isPending
  const form = useForm<QuickMessageInput>({
    resolver: zodResolver(quickMessageFormSchema),
    defaultValues: message ?? { name: '', command: '', message: '' },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (input) => {
        if (await mutate({ action: 'save', input, id: message?.id })) onBack()
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="quick-message-name">Nome</Label>
        <Input
          id="quick-message-name"
          autoFocus
          maxLength={60}
          placeholder="Boas-vindas"
          disabled={pending}
          {...form.register('name')}
          aria-invalid={!!form.formState.errors.name}
        />
        {form.formState.errors.name && (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.name.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-message-command">Comando</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          >
            /
          </span>
          <Input
            id="quick-message-command"
            className="pl-6"
            maxLength={40}
            placeholder="ola"
            disabled={pending}
            {...form.register('command')}
            aria-invalid={!!form.formState.errors.command}
            aria-describedby="quick-message-command-help"
          />
        </div>
        <p id="quick-message-command-help" className="text-xs text-muted-foreground">
          Sem espaços ou acentos. O comando é exclusivo desta sessão.
        </p>
        {form.formState.errors.command && (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.command.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="quick-message-body">Mensagem</Label>
        <Textarea
          id="quick-message-body"
          rows={6}
          className="max-h-60 min-h-36"
          maxLength={4096}
          placeholder="Olá! Como podemos ajudar?"
          disabled={pending}
          {...form.register('message')}
          aria-invalid={!!form.formState.errors.message}
        />
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>O texto será inserido no campo, sem enviar.</span>
          <span className="shrink-0 tabular-nums">{form.watch('message').length}/4096</span>
        </div>
        {form.formState.errors.message && (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.message.message}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar mensagem'}
        </Button>
      </div>
    </form>
  )
}

function ManagerContent() {
  const query = useAtomValue(quickMessagesAtom)
  const mutate = useSetAtom(manageQuickMessageAtom)
  const pending = useAtomValue(quickMessageMutationAtom).isPending
  const [editing, setEditing] = useState<QuickMessage | 'new' | null>(null)
  const [deleting, setDeleting] = useState<QuickMessage | null>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const items = filterQuickMessages(query.data ?? [], debouncedSearch)
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {deleting
            ? 'Excluir mensagem rápida?'
            : editing
              ? editing === 'new'
                ? 'Nova mensagem rápida'
                : 'Editar mensagem rápida'
              : 'Mensagens rápidas'}
        </DialogTitle>
        <DialogDescription>
          {deleting
            ? `Excluir “${deleting.name}” não altera mensagens já enviadas ou rascunhos.`
            : 'Atalhos desta sessão. Digite / no campo de mensagem para usá-los.'}
        </DialogDescription>
      </DialogHeader>
      {deleting ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              if (await mutate({ action: 'delete', id: deleting.id })) setDeleting(null)
            }}
          >
            {pending ? 'Excluindo…' : 'Excluir mensagem'}
          </Button>
        </div>
      ) : editing ? (
        <QuickMessageForm
          key={editing === 'new' ? 'new' : editing.id}
          message={editing === 'new' ? null : editing}
          onBack={() => setEditing(null)}
        />
      ) : (
        <>
          <Input
            aria-label="Buscar mensagens rápidas"
            placeholder="Buscar por nome ou comando…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {query.isPending ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Carregando mensagens rápidas…
            </p>
          ) : query.error ? (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{query.error.message}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void query.refetch()
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !items.length ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
              <Zap aria-hidden="true" className="size-8" />
              <p className="text-sm">
                {query.data?.length
                  ? 'Nenhuma mensagem encontrada.'
                  : 'Crie sua primeira mensagem rápida.'}
              </p>
            </div>
          ) : (
            <ul className="max-h-[min(50vh,24rem)] space-y-1 overflow-y-auto">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                      <span className="text-sm font-medium text-primary">/{item.command}</span>
                      <span className="truncate text-sm font-medium">{item.name}</span>
                    </div>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {item.message}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={`Editar mensagem ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    aria-label={`Excluir mensagem ${item.name}`}
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => setEditing('new')}
          >
            <Plus aria-hidden="true" />
            Nova mensagem rápida
          </Button>
        </>
      )}
    </>
  )
}

export default function QuickMessageManager() {
  const [target, setTarget] = useAtom(chatQuickMessageManagerAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const pending = useAtomValue(quickMessageMutationAtom).isPending
  const open = !!target && target === sessionId
  useEffect(() => {
    if (target && target !== sessionId) setTarget(null)
  }, [target, sessionId, setTarget])
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !pending) setTarget(null)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && <ManagerContent key={sessionId} />}
      </DialogContent>
    </Dialog>
  )
}
