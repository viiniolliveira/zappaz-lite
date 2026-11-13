import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue } from 'jotai'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { apiKeySessionsAtom, createApiKeyAtom } from '@/atoms/api-keys'
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const expirations = [
  { value: '3600', label: '1 hora' },
  { value: '86400', label: '1 dia' },
  { value: '604800', label: '7 dias' },
  { value: '2592000', label: '30 dias' },
  { value: '7776000', label: '90 dias' },
  { value: '15552000', label: '180 dias' },
  { value: '31536000', label: '1 ano' },
  { value: 'never', label: 'Sem expiração' },
] as const
const schema = z.object({
  scope: z.string().min(1, 'Selecione o acesso da chave'),
  name: z.string().trim().min(1, 'Informe um nome').max(100, 'Use até 100 caracteres'),
  expiration: z.enum([
    '3600',
    '86400',
    '604800',
    '2592000',
    '7776000',
    '15552000',
    '31536000',
    'never',
  ]),
})

function CreateKeyForm({ onClose }: { onClose: () => void }) {
  const create = useAtomValue(createApiKeyAtom)
  const sessions = useAtomValue(apiKeySessionsAtom)
  const [secret, setSecret] = useState<string | null>(null)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', expiration: '7776000', scope: '' },
  })

  if (secret)
    return (
      <>
        <DialogHeader>
          <DialogTitle>Guarde sua chave</DialogTitle>
          <DialogDescription>
            Esta é a única vez que o segredo será exibido. Copie e guarde em um local seguro antes
            de fechar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            aria-label="Chave de API criada"
            readOnly
            value={secret}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono"
          />
          <CopyButton copyValue={secret} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Já guardei a chave</Button>
        </DialogFooter>
      </>
    )

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova chave de API</DialogTitle>
        <DialogDescription>
          Dê um nome à integração e escolha por quanto tempo ela poderá acessar sua conta.
        </DialogDescription>
      </DialogHeader>
      <Form {...form}>
        <form
          className="min-w-0 space-y-6"
          onSubmit={form.handleSubmit(async ({ name, expiration, scope }) => {
            try {
              const result = await create.mutateAsync({
                name,
                metadata:
                  scope === 'global' ? { scope: 'global' } : { scope: 'session', sessionId: scope },
                expiresIn: expiration === 'never' ? null : Number(expiration),
              })
              setSecret(result.key)
            } catch {
              // O átomo apresenta o erro e o formulário preserva os valores.
            }
          })}
        >
          <fieldset disabled={create.isPending} className="min-w-0 space-y-5">
            <legend className="sr-only">Dados da chave</legend>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Integração CRM" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>Acesso</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger
                        className="w-full min-w-0 overflow-hidden [&_[data-slot=select-value]]:min-w-0"
                        onBlur={field.onBlur}
                        ref={field.ref}
                      >
                        <SelectValue placeholder="Selecione o acesso" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent
                      position="popper"
                      className="max-w-[var(--radix-select-trigger-width)]"
                    >
                      <SelectItem value="global">Global — todas as sessões permitidas</SelectItem>
                      {sessions.data?.map((session) => (
                        <SelectItem
                          key={session.id}
                          value={session.id}
                          className="[&>span:last-child]:min-w-0"
                        >
                          <span className="block truncate" title={session.displayName}>
                            {session.displayName}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Global inclui sessões futuras, conforme suas permissões. Uma sessão limita a
                    chave somente a ela.
                  </FormDescription>
                  {sessions.isPending && (
                    <p role="status" className="text-sm">
                      Carregando sessões…
                    </p>
                  )}
                  {sessions.isError && (
                    <div role="alert" className="text-sm">
                      Não foi possível carregar as sessões.
                      <Button type="button" variant="link" onClick={() => void sessions.refetch()}>
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expiration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Validade</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={create.isPending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full" onBlur={field.onBlur} ref={field.ref}>
                        <SelectValue placeholder="Selecione a validade" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent position="popper">
                      {expirations.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value === 'never' && (
                    <FormDescription>
                      Esta chave permanecerá válida até ser revogada. Use somente em integrações de
                      confiança.
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={create.isPending} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Criando…' : 'Criar chave'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  )
}

export default function CreateKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useAtomValue(createApiKeyAtom)
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!create.isPending) {
          if (!value) create.reset()
          onOpenChange(value)
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {open && (
          <CreateKeyForm
            onClose={() => {
              create.reset()
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
