import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { chatLabelMutationAtom, chatLabelsAtom, manageChatLabelAtom } from '@/atoms/chat-labels'
import { chatLabelManagerAtom, chatSessionIdAtom } from '@/atoms/ui'
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
import { type ChatLabel, type LabelInput, labelColors, labelFormSchema } from '@/lib/chat/labels'
import { cn } from '@/lib/utils'

function LabelForm({ label, onBack }: { label: ChatLabel | null; onBack: () => void }) {
  const mutate = useSetAtom(manageChatLabelAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  const form = useForm<LabelInput>({
    resolver: zodResolver(labelFormSchema),
    defaultValues: label ?? { name: '', description: '', color: labelColors[0].value },
  })
  const color = form.watch('color')
  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(async (input) => {
        if (await mutate({ action: 'save', input, labelId: label?.id })) onBack()
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="label-name">Nome</Label>
        <Input
          id="label-name"
          autoFocus
          maxLength={60}
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
        <Label htmlFor="label-description">
          Descrição <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="label-description"
          maxLength={500}
          disabled={pending}
          {...form.register('description')}
        />
        {form.formState.errors.description && (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.description.message}
          </p>
        )}
      </div>
      <fieldset disabled={pending} className="space-y-3">
        <legend className="text-sm font-medium">Cor</legend>
        <div className="flex flex-wrap gap-3">
          {labelColors.map((option) => (
            <label key={option.value} className="relative cursor-pointer" title={option.name}>
              <input
                type="radio"
                value={option.value}
                {...form.register('color')}
                className="peer sr-only"
                aria-label={option.name}
              />
              <span
                style={{ backgroundColor: option.value }}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border border-foreground/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ring',
                  color === option.value &&
                    'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                )}
              >
                {color === option.value && (
                  <Check aria-hidden="true" className="size-4 text-white drop-shadow" />
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="label-custom-color">Cor personalizada</Label>
            <p className="text-xs text-muted-foreground">Escolha outra cor para a etiqueta.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{color}</span>
            <input
              id="label-custom-color"
              type="color"
              value={color}
              disabled={pending}
              onChange={(event) =>
                form.setValue('color', event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1 focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
        </div>
        {form.formState.errors.color && (
          <p role="alert" className="text-xs text-destructive">
            {form.formState.errors.color.message}
          </p>
        )}
      </fieldset>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar etiqueta'}
        </Button>
      </div>
    </form>
  )
}

function ManagerContent({ initialCreate }: { initialCreate: boolean }) {
  const labels = useAtomValue(chatLabelsAtom)
  const mutate = useSetAtom(manageChatLabelAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  const [editing, setEditing] = useState<ChatLabel | 'new' | null>(initialCreate ? 'new' : null)
  const [deleting, setDeleting] = useState<ChatLabel | null>(null)
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {deleting
            ? 'Excluir etiqueta?'
            : editing
              ? editing === 'new'
                ? 'Criar etiqueta'
                : 'Editar etiqueta'
              : 'Etiquetas'}
        </DialogTitle>
        <DialogDescription>
          {deleting
            ? `Excluir “${deleting.name}” remove seus vínculos. As conversas e mensagens serão mantidas.`
            : 'Organize suas conversas somente no Zappaz. Nada será alterado no WhatsApp.'}
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
              if (await mutate({ action: 'delete', labelId: deleting.id })) setDeleting(null)
            }}
          >
            {pending ? 'Excluindo…' : 'Excluir etiqueta'}
          </Button>
        </div>
      ) : editing ? (
        <LabelForm
          key={editing === 'new' ? 'new' : editing.id}
          label={editing === 'new' ? null : editing}
          onBack={() => setEditing(null)}
        />
      ) : (
        <>
          {labels.isPending ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Carregando etiquetas…
            </p>
          ) : labels.error ? (
            <div role="alert">
              <p className="text-sm text-destructive">{labels.error.message}</p>
              <Button
                variant="outline"
                onClick={() => {
                  void labels.refetch()
                }}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !labels.data?.length ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Tags aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Crie sua primeira etiqueta para organizar as conversas.
              </p>
            </div>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {labels.data.map((label) => (
                <li
                  key={label.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50"
                >
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{label.name}</p>
                    {label.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {label.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar etiqueta ${label.name}`}
                    onClick={() => setEditing(label)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Excluir etiqueta ${label.name}`}
                    onClick={() => setDeleting(label)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button className="w-full" variant="outline" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            Criar etiqueta
          </Button>
        </>
      )}
    </>
  )
}

export default function LabelManager() {
  const [mode, setMode] = useAtom(chatLabelManagerAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const pending = useAtomValue(chatLabelMutationAtom).isPending
  return (
    <Dialog
      open={!!mode && !!sessionId}
      onOpenChange={(open) => {
        if (!open && !pending) setMode(null)
      }}
    >
      <DialogContent>
        {mode && sessionId && (
          <ManagerContent key={`${sessionId}/${mode}`} initialCreate={mode === 'create'} />
        )}
      </DialogContent>
    </Dialog>
  )
}
