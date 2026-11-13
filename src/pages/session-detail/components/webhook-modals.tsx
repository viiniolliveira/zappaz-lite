'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom } from 'jotai'
import { EyeIcon, EyeOffIcon, Loader2Icon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, type UseFormReturn, useFieldArray, useForm } from 'react-hook-form'
import * as z from 'zod'
import {
  createWebhookAtom,
  createWebhookModalOpenAtom,
  deleteWebhookAtom,
  deleteWebhookModalOpenAtom,
  editWebhookModalOpenAtom,
  selectedWebhookAtom,
  updateWebhookAtom,
} from '@/atoms/webhook'
import { Button } from '@/components/ui/button'
import CopyButton from '@/components/ui/CopyButton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MultiSelectWebhook, { webhookEvents } from './multiselect-webhooks'

const webhookSchema = z.object({
  displayName: z.string().min(1, 'O nome do webhook é obrigatório'),
  url: z.string().url('URL inválida').min(1, 'A URL do webhook é obrigatória'),
  secret: z
    .string()
    .max(2048)
    .regex(/^[\x21-\x7e]*$/, 'Use caracteres ASCII visíveis, sem espaços'),
  headers: z
    .array(
      z.object({
        name: z
          .string()
          .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, 'Nome de header inválido')
          .max(100),
        value: z
          .string()
          .max(2048)
          .regex(/^[^\r\n]*$/, 'Valor de header inválido'),
      }),
    )
    .max(20)
    .refine((headers) => {
      const names = headers.map(({ name }) => name.toLowerCase())
      return (
        new Set(names).size === names.length &&
        !names.some((name) =>
          [
            'x-zappaz-webhook-secret',
            'host',
            'connection',
            'content-length',
            'transfer-encoding',
            'proxy-authorization',
            'upgrade',
          ].includes(name),
        )
      )
    }, 'Use nomes únicos e não reservados'),
  events: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .min(1, 'Selecione pelo menos um evento'),
})

type WebhookFormValues = z.infer<typeof webhookSchema>

function generateWebhookSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function WebhookHeadersFields({
  form,
  prefix,
}: {
  form: UseFormReturn<WebhookFormValues>
  prefix: string
}) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'headers' })
  const [showSecret, setShowSecret] = useState(false)
  const secret = form.watch('secret')
  return (
    <div className="grid gap-3">
      <Label htmlFor={`${prefix}-secret`}>Segredo do webhook (opcional)</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`${prefix}-secret`}
          type={showSecret ? 'text' : 'password'}
          autoComplete="new-password"
          className="min-w-0 flex-1"
          placeholder="Informe um segredo"
          {...form.register('secret')}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={showSecret ? 'Ocultar segredo' : 'Mostrar segredo'}
          onClick={() => setShowSecret(!showSecret)}
        >
          {showSecret ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        {secret && <CopyButton copyValue={secret} />}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Gerar novo segredo"
          title="Gerar novo segredo"
          onClick={() => {
            form.setValue('secret', generateWebhookSecret(), { shouldValidate: true })
          }}
        >
          <RefreshCwIcon className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Enviado no header X-Zappaz-Webhook-Secret.</p>
      {form.formState.errors.secret && (
        <p className="text-sm text-destructive">{form.formState.errors.secret.message}</p>
      )}
      {fields.map((field, index) => (
        <div key={field.id} className="grid gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <Label>Header personalizado {index + 1}</Label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover header ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
          <Input
            aria-label={`Nome do header ${index + 1}`}
            placeholder="Nome do header"
            {...form.register(`headers.${index}.name`)}
          />
          <Input
            aria-label={`Valor do header ${index + 1}`}
            type="password"
            autoComplete="off"
            placeholder="Valor do header"
            {...form.register(`headers.${index}.value`)}
          />
          {(form.formState.errors.headers?.[index]?.name ||
            form.formState.errors.headers?.[index]?.value) && (
            <p className="text-sm text-destructive">
              {form.formState.errors.headers?.[index]?.name?.message ||
                form.formState.errors.headers?.[index]?.value?.message}
            </p>
          )}
        </div>
      ))}
      {form.formState.errors.headers?.root && (
        <p className="text-sm text-destructive">{form.formState.errors.headers.root.message}</p>
      )}
      {form.formState.errors.headers?.message && (
        <p className="text-sm text-destructive">{form.formState.errors.headers.message}</p>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={fields.length >= 20}
        onClick={() => append({ name: '', value: '' })}
      >
        <PlusIcon className="size-4" />
        Adicionar header personalizado
      </Button>
    </div>
  )
}

export function CreateWebhookModal({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useAtom(createWebhookModalOpenAtom)
  const [{ isPending, mutate: createWebhook }] = useAtom(createWebhookAtom)

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      displayName: '',
      url: '',
      secret: '',
      headers: [],
      events: [],
    },
  })

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        displayName: '',
        url: '',
        secret: generateWebhookSecret(),
        headers: [],
        events: [],
      })
    }
  }, [open, form])

  const onSubmit = (data: WebhookFormValues) => {
    const headers = Object.fromEntries(data.headers.map(({ name, value }) => [name, value]))
    createWebhook(
      {
        sessionId,
        req: {
          displayName: data.displayName,
          url: data.url,
          events: data.events.map((e) => e.value),
          enabled: true,
          headers,
          ...(data.secret ? { secret: data.secret } : {}),
        },
      },
      {
        onSuccess: () => {
          setOpen(false)
          form.reset()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-visible sm:max-w-lg">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid max-h-[calc(90dvh-3rem)] gap-6 overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Criar Webhook</DialogTitle>
            <DialogDescription>
              Crie um webhook para comecar a enviar eventos para a sua aplicação.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6">
            <div className="grid gap-3">
              <Label htmlFor="displayName">Nome</Label>
              <Input
                id="displayName"
                placeholder="Nome do webhook"
                {...form.register('displayName')}
              />
              {form.formState.errors.displayName && (
                <p className="text-sm text-red-500">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <WebhookHeadersFields form={form} prefix="create" />

            <div className="grid gap-3">
              <Label htmlFor="url">Webhook URL</Label>
              <Input id="url" placeholder="https://example.com/webhook" {...form.register('url')} />
              {form.formState.errors.url && (
                <p className="text-sm text-red-500">{form.formState.errors.url.message}</p>
              )}
            </div>

            <div className="grid gap-3">
              <Label>Selecione os eventos</Label>
              <Controller
                control={form.control}
                name="events"
                render={({ field }) => (
                  <MultiSelectWebhook
                    selectedEvents={field.value}
                    setSelectedEvents={field.onChange}
                  />
                )}
              />
              {form.formState.errors.events && (
                <p className="text-sm text-red-500">{form.formState.errors.events.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex! w-full!">
            <Button
              className="w-full sm:max-w-fit"
              variant="outline"
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button className="w-full sm:max-w-fit" type="submit" disabled={isPending}>
              {isPending ? <Loader2Icon size={18} className="animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditWebhookModal({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useAtom(editWebhookModalOpenAtom)
  const [selectedWebhook, setSelectedWebhook] = useAtom(selectedWebhookAtom)
  const [{ isPending, mutate: updateWebhook }] = useAtom(updateWebhookAtom)

  const form = useForm<WebhookFormValues>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      displayName: '',
      url: '',
      secret: '',
      headers: [],
      events: [],
    },
  })

  useEffect(() => {
    if (open && selectedWebhook) {
      let activeEventKeys: string[] = []
      if (Array.isArray(selectedWebhook.events)) {
        activeEventKeys = selectedWebhook.events
      } else if (selectedWebhook.events) {
        activeEventKeys = Object.keys(selectedWebhook.events).filter(
          (key) => selectedWebhook.events[key as keyof typeof selectedWebhook.events],
        )
      }

      form.reset({
        displayName: selectedWebhook.displayName || '',
        url: selectedWebhook.url || '',
        secret: selectedWebhook.secret ?? '',
        headers: Object.entries(selectedWebhook.headers).map(([name, value]) => ({ name, value })),
        events: activeEventKeys.map((key) => {
          const found = webhookEvents.find((e) => e.value === key)
          return found || { label: key, value: key }
        }), // MultiSelect will match value
      })
    }
  }, [open, selectedWebhook, form])

  const onSubmit = (data: WebhookFormValues) => {
    if (!selectedWebhook) return

    const headers = Object.fromEntries(data.headers.map(({ name, value }) => [name, value]))

    updateWebhook(
      {
        sessionId,
        webhookId: selectedWebhook.id,
        req: {
          displayName: data.displayName,
          url: data.url,
          events: data.events.map((e) => e.value),
          enabled: selectedWebhook.enabled,
          headers,
          secret: data.secret || null,
        },
      },
      {
        onSuccess: () => {
          setOpen(false)
          setSelectedWebhook(null)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val)
        if (!val) setSelectedWebhook(null)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-visible sm:max-w-lg">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid max-h-[calc(90dvh-3rem)] gap-6 overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Editar Webhook</DialogTitle>
            <DialogDescription>
              Edite um webhook existente para atualizar os eventos
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6">
            <div className="grid gap-3">
              <Label htmlFor="edit-displayName">Nome</Label>
              <Input
                id="edit-displayName"
                placeholder="Nome do webhook"
                {...form.register('displayName')}
              />
              {form.formState.errors.displayName && (
                <p className="text-sm text-red-500">{form.formState.errors.displayName.message}</p>
              )}
            </div>

            <WebhookHeadersFields form={form} prefix="edit" />

            <div className="grid gap-3">
              <Label htmlFor="edit-url">Webhook URL</Label>
              <Input
                id="edit-url"
                placeholder="https://example.com/webhook"
                {...form.register('url')}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-red-500">{form.formState.errors.url.message}</p>
              )}
            </div>

            <div className="grid gap-3">
              <Label>Selecione os eventos</Label>
              <Controller
                control={form.control}
                name="events"
                render={({ field }) => (
                  <MultiSelectWebhook
                    selectedEvents={field.value}
                    setSelectedEvents={field.onChange}
                  />
                )}
              />
              {form.formState.errors.events && (
                <p className="text-sm text-red-500">{form.formState.errors.events.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex !w-full!">
            <Button
              className="w-full sm:max-w-fit"
              variant="outline"
              type="button"
              onClick={() => {
                setOpen(false)
                setSelectedWebhook(null)
              }}
            >
              Cancelar
            </Button>
            <Button className="w-full sm:max-w-fit" type="submit" disabled={isPending}>
              {isPending ? <Loader2Icon size={18} className="animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteWebhookModal({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useAtom(deleteWebhookModalOpenAtom)
  const [selectedWebhook, setSelectedWebhook] = useAtom(selectedWebhookAtom)
  const [{ isPending, mutate: deleteWebhook }] = useAtom(deleteWebhookAtom)

  const handleDelete = () => {
    if (!selectedWebhook) return
    deleteWebhook(
      { sessionId, webhookId: selectedWebhook.id },
      {
        onSuccess: () => {
          setOpen(false)
          setSelectedWebhook(null)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        setOpen(val)
        if (!val) setSelectedWebhook(null)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Você tem certeza?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Isso irá deletar permanentemente o webhook &quot;
            {selectedWebhook?.displayName}&quot;.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false)
              setSelectedWebhook(null)
            }}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? <Loader2Icon size={18} className="animate-spin mr-2" /> : null}
            Deletar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
