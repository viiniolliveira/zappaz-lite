import { useAtomValue, useSetAtom } from 'jotai'
import { Building2, Mail, Phone, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import {
  openChatContactAtom,
  openChatConversationMutationAtom,
  sharedContactQueryAtom,
  sharedSavedContactAtom,
} from '@/atoms/chat-contacts'
import { chatContactFormAtom, chatSessionIdAtom } from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import type { MessageDTO } from '@/lib/chat/schemas'
import { sharedContactPhone } from '@/lib/chat/shared-contact'

function ContactCard({
  contact,
  metadata,
}: {
  contact: MessageDTO['contacts'][number]
  metadata?: ReactNode
}) {
  const phoneNumber = sharedContactPhone(contact)
  const query = useAtomValue(sharedContactQueryAtom(phoneNumber ?? ''))
  const saved = useAtomValue(sharedSavedContactAtom(phoneNumber ?? ''))
  const sessionId = useAtomValue(chatSessionIdAtom)
  const denied = useAtomValue(chatAccessDeniedAtom)
  const { isPending: opening } = useAtomValue(openChatConversationMutationAtom)
  const open = useSetAtom(openChatContactAtom)
  const setForm = useSetAtom(chatContactFormAtom)
  const name = contact.name || contact.parsed?.name || phoneNumber || 'Contato compartilhado'
  const disabled = !phoneNumber || !sessionId || denied

  return (
    <div
      data-slot="message-contact"
      className="w-72 max-w-full overflow-hidden rounded-lg bg-foreground/5 text-sm"
    >
      <div className="flex gap-2.5 p-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UserRound aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">
          <p className="font-medium">{name}</p>
          {contact.parsed?.phones.map((phone) => (
            <p
              key={`${phone.number}-${phone.waid ?? ''}`}
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Phone aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{phone.number}</span>
            </p>
          ))}
          {contact.parsed?.emails.map((email) => (
            <p key={email} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Mail aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{email}</span>
            </p>
          ))}
          {contact.parsed?.organization && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{contact.parsed.organization}</span>
            </p>
          )}
          {contact.vcard && contact.parsed === null && (
            <p className="text-xs text-muted-foreground">Não foi possível interpretar o vCard.</p>
          )}
          {!phoneNumber && (
            <p className="text-xs text-muted-foreground">
              Telefone indisponível para iniciar conversa ou salvar.
            </p>
          )}
        </div>
      </div>
      {metadata && <div className="px-2.5 pb-1.5">{metadata}</div>}
      <div className="flex flex-col border-t border-foreground/10">
        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-none"
          disabled={disabled || opening}
          onClick={() => {
            if (phoneNumber)
              void open(saved ? saved.id : { phoneNumber }).catch((error) =>
                toast.error(
                  error instanceof Error ? error.message : 'Não foi possível abrir a conversa',
                ),
              )
          }}
        >
          {opening ? 'Abrindo…' : 'Enviar mensagem'}
        </Button>
        {!saved && (
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-none border-t border-foreground/10"
            disabled={disabled || !query.isSuccess}
            onClick={() => {
              if (phoneNumber)
                setForm({
                  surface: 'dialog',
                  name,
                  phoneNumber,
                  saved: false,
                  email: contact.parsed?.emails[0] ?? '',
                })
            }}
          >
            {phoneNumber && query.isPending && !disabled
              ? 'Verificando contato…'
              : 'Salvar contato'}
          </Button>
        )}
      </div>
      {query.isError && !disabled && !saved && (
        <div role="alert" className="px-2.5 pb-2 text-xs text-destructive">
          <p>Não foi possível verificar a agenda.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void query.refetch()
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  )
}

export default function MessageContacts({
  contacts,
  metadata,
}: {
  contacts: MessageDTO['contacts']
  metadata?: ReactNode
}) {
  if (!contacts.length)
    return <p className="text-sm text-muted-foreground">Contato compartilhado</p>
  return (
    <div className="w-72 max-w-full space-y-2">
      {contacts.map((contact, index) => (
        <ContactCard
          key={`${contact.vcard ?? ''}-${contact.name ?? ''}`}
          contact={contact}
          metadata={index === contacts.length - 1 ? metadata : undefined}
        />
      ))}
    </div>
  )
}
