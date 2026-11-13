import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import * as z from 'zod'
import { updateSessionAtom } from '@/atoms/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { SessionSchema } from '@/services/types'

const settingsSchema = z
  .object({
    signatureEnabled: z.boolean(),
    signatureName: z
      .string()
      .trim()
      .max(100, 'Use até 100 caracteres')
      .regex(/^[^\r\n]*$/, 'Use uma única linha'),
    syncFullHistory: z.boolean(),
    ignoreGroups: z.boolean(),
    markOnlineOnConnect: z.boolean(),
    rejectCalls: z.boolean(),
    messageOnCall: z.string().max(4096, 'Use até 4096 caracteres'),
  })
  .refine((data) => !data.signatureEnabled || !!data.signatureName, {
    path: ['signatureName'],
    message: 'Informe um nome para ativar a assinatura',
  })

type SettingsFormValues = z.infer<typeof settingsSchema>

const connectionSettings = [
  {
    name: 'syncFullHistory',
    label: 'Sincronizar histórico',
    description:
      'Importa o histórico disponível na próxima conexão, sem salvar contatos na agenda.',
  },
  {
    name: 'ignoreGroups',
    label: 'Ignorar grupos',
    description: 'Não processa os eventos recebidos de grupos.',
  },
  {
    name: 'markOnlineOnConnect',
    label: 'Marcar como online',
    description: 'Mostra a sessão como online ao conectar ao WhatsApp.',
  },
] as const

export default function SessionSettings({ session }: { session: SessionSchema }) {
  const [{ isPending: loading, mutate: updateSession }] = useAtom(updateSessionAtom)
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    mode: 'onChange',
    defaultValues: {
      signatureEnabled: session.config.signatureEnabled,
      signatureName: session.config.signatureName,
      syncFullHistory: session.config.syncFullHistory,
      ignoreGroups: session.config.ignoreGroups,
      markOnlineOnConnect: session.config.markOnlineOnConnect,
      rejectCalls: session.config.rejectCalls,
      messageOnCall: session.config.messageOnCall ?? '',
    },
  })
  const { reset } = form
  const signatureName = useWatch({ control: form.control, name: 'signatureName' })

  useEffect(() => {
    reset(
      {
        signatureEnabled: session.config.signatureEnabled,
        signatureName: session.config.signatureName,
        syncFullHistory: session.config.syncFullHistory,
        ignoreGroups: session.config.ignoreGroups,
        markOnlineOnConnect: session.config.markOnlineOnConnect,
        rejectCalls: session.config.rejectCalls,
        messageOnCall: session.config.messageOnCall ?? '',
      },
      { keepDirtyValues: true },
    )
  }, [reset, session.config])

  function onSubmit(data: SettingsFormValues) {
    updateSession(
      { id: session.id, req: { config: data } },
      {
        onSuccess: () => reset(data),
      },
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">Configurações da sessão</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize os envios e o comportamento do WhatsApp.
        </p>
      </header>

      <fieldset disabled={loading} className="min-w-0 space-y-6 disabled:opacity-70">
        <section
          aria-labelledby="signature-heading"
          className="grid gap-4 border-t pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8"
        >
          <div>
            <h3 id="signature-heading" className="text-sm font-medium">
              Assinatura de mensagens
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Identifique quem está falando. Aplicada somente a mensagens de texto, nunca a mídias
              ou legendas.
            </p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="signature-enabled">Assinar mensagens por padrão</Label>
              <Controller
                control={form.control}
                name="signatureEnabled"
                render={({ field }) => (
                  <Switch
                    id="signature-enabled"
                    name={field.name}
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={loading}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signature-name">Nome da assinatura</Label>
              <Controller
                control={form.control}
                name="signatureName"
                render={({ field }) => (
                  <Input
                    {...field}
                    id="signature-name"
                    placeholder="Ex.: Lucas - Financeiro"
                    maxLength={100}
                    aria-invalid={!!form.formState.errors.signatureName}
                    aria-describedby={
                      form.formState.errors.signatureName
                        ? 'signature-name-error'
                        : 'signature-name-help'
                    }
                  />
                )}
              />
              {form.formState.errors.signatureName ? (
                <p id="signature-name-error" role="alert" className="text-xs text-destructive">
                  {form.formState.errors.signatureName.message}
                </p>
              ) : (
                <p id="signature-name-help" className="text-xs text-muted-foreground">
                  O mesmo nome será usado em todas as conversas desta sessão.
                </p>
              )}
            </div>
            {signatureName.trim() && (
              <div className="space-y-2 rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Prévia da assinatura</p>
                <p className="break-words text-sm">
                  <strong>{signatureName.trim()}:</strong>
                  <br />
                  Olá, como posso te ajudar?
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="connection-heading"
          className="grid gap-4 border-t pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8"
        >
          <div>
            <h3 id="connection-heading" className="text-sm font-medium">
              Conexão e recebimento
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Preferências de presença e sincronização da sessão.
            </p>
          </div>
          <div className="min-w-0 space-y-5">
            {connectionSettings.map((setting) => (
              <div key={setting.name} className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor={setting.name}>{setting.label}</Label>
                  <p id={`${setting.name}-description`} className="text-xs text-muted-foreground">
                    {setting.description}
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name={setting.name}
                  render={({ field }) => (
                    <Switch
                      id={setting.name}
                      name={field.name}
                      ref={field.ref}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={loading}
                      aria-describedby={`${setting.name}-description`}
                    />
                  )}
                />
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="calls-heading"
          className="grid gap-4 border-t pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8"
        >
          <div>
            <h3 id="calls-heading" className="text-sm font-medium">
              Chamadas recebidas
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina como responder a quem ligar para esta sessão.
            </p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="reject-calls">Rejeitar chamadas</Label>
              <Controller
                control={form.control}
                name="rejectCalls"
                render={({ field }) => (
                  <Switch
                    id="reject-calls"
                    name={field.name}
                    ref={field.ref}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={loading}
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="messageOnCall">
                Mensagem automática{' '}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Controller
                control={form.control}
                name="messageOnCall"
                render={({ field }) => (
                  <Input
                    {...field}
                    id="messageOnCall"
                    placeholder="Ex.: Não atendemos chamadas. Envie uma mensagem."
                    maxLength={4096}
                    aria-describedby="call-message-help"
                  />
                )}
              />
              <p id="call-message-help" className="text-xs text-muted-foreground">
                Enviada ao receber uma chamada. Deixe em branco para não responder.
              </p>
              {form.formState.errors.messageOnCall && (
                <p role="alert" className="text-xs text-destructive">
                  {form.formState.errors.messageOnCall.message}
                </p>
              )}
            </div>
          </div>
        </section>
      </fieldset>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <p role="status" className="mr-auto text-xs text-muted-foreground">
          {form.formState.isDirty ? 'Alterações não salvas' : 'Nenhuma alteração pendente'}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={!form.formState.isDirty || loading}
          onClick={() => reset()}
        >
          Descartar
        </Button>
        <Button type="submit" disabled={!form.formState.isDirty || loading}>
          {loading && <Loader2Icon aria-hidden="true" className="motion-safe:animate-spin" />}
          {loading ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </footer>
    </form>
  )
}
