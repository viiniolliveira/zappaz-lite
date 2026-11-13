import { zodResolver } from '@hookform/resolvers/zod'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { chatContactMutationAtom, submitChatContactAtom } from '@/atoms/chat-contacts'
import { chatContactFormAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
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
import { PhoneInput } from '@/components/ui/phone-input/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { contactNameSchema, saveChatContactSchema } from '@/services/chat'

const existingContactSchema = contactNameSchema.extend({ phoneNumber: z.string() })

export default function ContactForm() {
  const [target, setTarget] = useAtom(chatContactFormAtom)
  const submit = useSetAtom(submitChatContactAtom)
  const { isPending } = useAtomValue(chatContactMutationAtom)
  const form = useForm({
    resolver: zodResolver(target?.contactId ? existingContactSchema : saveChatContactSchema),
    defaultValues: {
      name: target?.name ?? '',
      phoneNumber: target?.phoneNumber ? `+${target.phoneNumber}` : '',
      email: target?.email ?? '',
      annotations: target?.annotations ?? '',
    },
  })
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await submit(values)
        })}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  autoFocus
                  maxLength={200}
                  disabled={isPending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phoneNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone</FormLabel>
              <FormControl>
                <PhoneInput
                  autoComplete="tel"
                  placeholder={
                    target?.contactId && !target.phoneNumber
                      ? 'Telefone indisponível'
                      : '00 00000-0000'
                  }
                  disabled={isPending || !!target?.contactId}
                  {...field}
                  onChange={(value) => field.onChange(value ?? '')}
                />
              </FormControl>
              <FormDescription>
                {target?.contactId
                  ? target.phoneNumber
                    ? 'O telefone identifica a conversa e não pode ser alterado.'
                    : 'Este contato possui apenas um identificador do WhatsApp, sem telefone disponível.'
                  : 'Inclua o código do país e o DDD.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Email <span className="font-normal text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="contato@exemplo.com"
                  maxLength={254}
                  disabled={isPending}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="annotations"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Anotações <span className="font-normal text-muted-foreground">(opcional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  maxLength={5000}
                  placeholder="Escreva uma anotação sobre este contato…"
                  className="max-h-48 min-h-24 resize-y field-sizing-fixed"
                  disabled={isPending}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormDescription>
                Até 5.000 caracteres. Essas informações ficam somente no Zappaz.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => setTarget(null)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {isPending ? 'Salvando…' : 'Salvar contato'}
          </Button>
        </div>
      </form>
    </Form>
  )
}
