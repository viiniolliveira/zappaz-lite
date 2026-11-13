import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  ArrowLeft,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import {
  chatContactPagesAtom,
  chatSavedContactsAtom,
  openChatContactAtom,
  openChatConversationMutationAtom,
} from '@/atoms/chat-contacts'
import {
  chatContactFormAtom,
  chatContactSearchAtom,
  chatDeleteContactAtom,
  chatSessionIdAtom,
  chatSidebarTabAtom,
} from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { contactInitials } from '@/lib/chat/types'
import ContactAvatar from './contact-avatar'

export default function ContactList() {
  const [search, setSearch] = useAtom(chatContactSearchAtom)
  const setForm = useSetAtom(chatContactFormAtom)
  const setDelete = useSetAtom(chatDeleteContactAtom)
  const setTab = useSetAtom(chatSidebarTabAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const denied = useAtomValue(chatAccessDeniedAtom)
  const pages = useAtomValue(chatContactPagesAtom)
  const contacts = useAtomValue(chatSavedContactsAtom)
  const select = useSetAtom(openChatContactAtom)
  const { isPending: opening } = useAtomValue(openChatConversationMutationAtom)
  const open = (contactId: string) => {
    void select(contactId).catch((error) =>
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a conversa'),
    )
  }

  return (
    <>
      <div className="space-y-4 border-b p-4 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              autoFocus
              aria-label="Voltar para conversas"
              onClick={() => setTab('conversations')}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h2 className="font-semibold">Contatos</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Adicionar contato"
            disabled={!sessionId || denied}
            onClick={() => setForm({ surface: 'dialog', name: '', phoneNumber: '', saved: false })}
          >
            <UserPlus aria-hidden="true" />
          </Button>
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
          />
          <Input
            aria-label="Buscar contatos"
            placeholder="Buscar nome, telefone ou JID"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-10 bg-muted/40 pr-10 pl-9 text-sm"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Limpar busca de contatos"
              onClick={() => setSearch('')}
              className="absolute top-1 right-1"
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!sessionId ? (
          <p role="status" className="p-6 text-center text-sm text-muted-foreground">
            Selecione uma sessão para gerenciar sua agenda do Zappaz.
          </p>
        ) : denied ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            Sem permissão para acessar os contatos desta sessão.
          </p>
        ) : pages.isPending ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
          >
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Carregando contatos…
          </p>
        ) : pages.error ? (
          <div role="alert" className="space-y-3 p-6 text-sm">
            <p>{pages.error.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void pages.refetch()
              }}
            >
              Tentar novamente
            </Button>
          </div>
        ) : !contacts.length ? (
          <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Users aria-hidden="true" className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">
              {search ? 'Nenhum contato encontrado' : 'Sua agenda está vazia'}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {search
                ? 'Tente outro nome, telefone ou JID.'
                : 'Adicione contatos ou salve os números das suas conversas. Sua agenda fica somente no Zappaz.'}
            </p>
          </div>
        ) : (
          <ul className="p-2">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <ContextMenu>
                  <ContextMenuTrigger
                    render={<div />}
                    className="group flex items-center rounded-lg hover:bg-muted focus-within:bg-muted"
                  >
                    <button
                      type="button"
                      disabled={opening}
                      onClick={() => open(contact.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-4 text-left focus-visible:outline-offset-[-2px] disabled:opacity-50"
                    >
                      <ContactAvatar
                        initials={contactInitials(contact.displayName)}
                        avatarUrl={contact.avatarUrl}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {contact.displayName}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {contact.phoneNumber ?? contact.jid}
                        </span>
                      </span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mr-1 shrink-0"
                          aria-label={`Ações de ${contact.displayName}`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem variant="destructive" onClick={() => setDelete(contact)}>
                          <Trash2 aria-hidden="true" />
                          Excluir contato
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ContextMenuTrigger>
                  <ContextMenuContent aria-label={`Ações do contato ${contact.displayName}`}>
                    <ContextMenuItem variant="destructive" onClick={() => setDelete(contact)}>
                      <Trash2 aria-hidden="true" />
                      Excluir contato
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            ))}
          </ul>
        )}
        {sessionId && !denied && pages.hasNextPage && (
          <Button
            className="w-full"
            variant="ghost"
            disabled={pages.isFetchingNextPage}
            onClick={() => {
              void pages.fetchNextPage()
            }}
          >
            {pages.isFetchingNextPage ? 'Carregando…' : 'Carregar mais contatos'}
          </Button>
        )}
      </div>
    </>
  )
}
