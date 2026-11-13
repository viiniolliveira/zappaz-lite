import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  Check,
  CheckSquare,
  ChevronDown,
  Mail,
  MailOpen,
  MessageCirclePlus,
  MoreVertical,
  Pencil,
  Search,
  SearchX,
  Tags,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { chatDeleteMutationAtom } from '@/atoms/chat-delete'
import { chatBulkLabelsMutationAtom } from '@/atoms/chat-labels'
import { chatReadStateMutationAtom, setChatReadStateAtom } from '@/atoms/chat-read'
import {
  chatBulkLabelsOpenAtom,
  chatContactFormAtom,
  chatContactPanelAtom,
  chatConversationQueryAtom,
  chatConversationSearchAtom,
  chatConversationSelectionAtom,
  chatDeleteConversationIdsAtom,
  chatDraftsAtom,
  chatLabelFilterAtom,
  chatLabelTargetAtom,
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
import { type ChatConversation, formatMessageTime, messagePreview } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import BulkLabelsDialog from './bulk-labels-dialog'
import ChatSessionPicker from './chat-session-picker'
import ContactFormDialog from './contact-form-dialog'
import ContactList from './contact-list'
import ConversationAvatar from './conversation-avatar'
import ConversationListSkeleton from './conversation-list-skeleton'
import DeleteContactDialog from './delete-contact-dialog'
import DeleteConversationDialog from './delete-conversation-dialog'
import LabelBadges from './label-badges'
import LabelEditorDialog from './label-editor-dialog'
import LabelManager from './label-manager'
import LabelMenu from './label-menu'

interface ConversationListProps {
  conversations: ChatConversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  loading?: boolean
  onLoadMore?: () => void
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  hasMore,
  loadingMore,
  loading = false,
  onLoadMore,
}: ConversationListProps) {
  const [search, setSearch] = useAtom(chatConversationSearchAtom)
  const [deleteIds, setDeleteIds] = useAtom(chatDeleteConversationIdsAtom)
  const sessionId = useAtomValue(chatSessionIdAtom)
  const drafts = useAtomValue(chatDraftsAtom)
  const [labelFilter, setLabelFilter] = useAtom(chatLabelFilterAtom)
  const setLabelTarget = useSetAtom(chatLabelTargetAtom)
  const setBulkLabelsOpen = useSetAtom(chatBulkLabelsOpenAtom)
  const bulkLabeling = useAtomValue(chatBulkLabelsMutationAtom).isPending
  const [selection, setSelection] = useAtom(chatConversationSelectionAtom)
  const selecting = !!selection && selection.sessionId === sessionId
  const selectedIds = selecting ? selection.ids : []
  const markReadState = useSetAtom(setChatReadStateAtom)
  const reading = useAtomValue(chatReadStateMutationAtom).isPending
  const deleting = useAtomValue(chatDeleteMutationAtom).isPending
  const busy = reading || deleting || bulkLabeling
  const toggleSelection = (id: string) => {
    if (!sessionId || busy) return
    setSelection((current) => {
      const ids = current?.sessionId === sessionId ? current.ids : []
      return { sessionId, ids: ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id] }
    })
  }
  useEffect(
    () => () => {
      setSelection(null)
      setDeleteIds([])
      setBulkLabelsOpen(false)
    },
    [setSelection, setDeleteIds, setBulkLabelsOpen],
  )
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [tab, setTab] = useAtom(chatSidebarTabAtom)
  const newConversationButton = useRef<HTMLButtonElement>(null)
  const previousTab = useRef(tab)
  useEffect(() => {
    if (previousTab.current === 'contacts' && tab === 'conversations')
      newConversationButton.current?.focus({ preventScroll: true })
    previousTab.current = tab
  }, [tab])
  const setContactForm = useSetAtom(chatContactFormAtom)
  const setContactPanel = useSetAtom(chatContactPanelAtom)
  const query = useAtomValue(chatConversationQueryAtom).trim().toLocaleLowerCase('pt-BR')
  const filtered = conversations
    .filter(
      (conversation) =>
        (!onlyUnread || conversation.unreadCount > 0) &&
        (!labelFilter || conversation.labelIds.includes(labelFilter)) &&
        (!query ||
          `${conversation.displayName} ${conversation.contact?.phoneNumber ?? ''} ${conversation.jid}`
            .toLocaleLowerCase('pt-BR')
            .includes(query)),
    )
    .toSorted(
      (a, b) =>
        (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || b.id.localeCompare(a.id),
    )
  const unreadConversations = conversations.filter(
    (conversation) => conversation.unreadCount > 0,
  ).length
  const initialLoading = loading && conversations.length === 0

  return (
    <aside
      aria-label="Conversas e contatos"
      className={cn(
        'flex min-h-0 w-full shrink-0 flex-col bg-background md:w-80 md:border-r lg:w-90',
        selectedId && 'hidden md:flex',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-18 shrink-0 items-center border-b px-4">
          <ChatSessionPicker />
        </header>
        {tab === 'contacts' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <ContactList />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 border-b p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">Conversas</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {conversations.length} conversas
                  </span>
                  <Button
                    ref={newConversationButton}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Nova conversa"
                    onClick={() => {
                      setSelection(null)
                      setTab('contacts')
                    }}
                  >
                    <MessageCirclePlus aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                />
                <Input
                  aria-label="Buscar conversas"
                  placeholder="Buscar nome, telefone ou JID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-10 bg-muted/40 pr-10 pl-9 text-sm"
                />
                {search && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Limpar busca"
                    onClick={() => setSearch('')}
                    className="absolute top-1 right-1"
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
              {selecting ? (
                <fieldset className="flex h-8 items-center gap-2" aria-label="Seleção de conversas">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Fechar seleção de conversas"
                    disabled={busy}
                    onClick={() => setSelection(null)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                  <span role="status" className="min-w-0 flex-1 text-sm font-medium tabular-nums">
                    {selectedIds.length} {selectedIds.length === 1 ? 'selecionada' : 'selecionadas'}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Ações das conversas selecionadas"
                        disabled={!selectedIds.length || busy}
                      >
                        <MoreVertical aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" aria-label="Ações das conversas selecionadas">
                      <DropdownMenuItem onClick={() => setBulkLabelsOpen(true)}>
                        <Tags aria-hidden="true" />
                        Alterar etiquetas
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteIds([...selectedIds])}
                      >
                        <Trash2 aria-hidden="true" /> Excluir selecionadas
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void markReadState({ conversationIds: selectedIds, read: false })
                        }}
                      >
                        <Mail aria-hidden="true" /> Marcar como não lidas
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void markReadState({ conversationIds: selectedIds, read: true })
                        }}
                      >
                        <MailOpen aria-hidden="true" /> Marcar como lidas
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </fieldset>
              ) : (
                <fieldset className="flex flex-wrap gap-2" aria-label="Filtrar conversas">
                  <Button
                    size="sm"
                    variant={onlyUnread ? 'ghost' : 'default'}
                    aria-pressed={!onlyUnread}
                    onClick={() => {
                      setOnlyUnread(false)
                      setLabelFilter(null)
                    }}
                  >
                    Todas
                  </Button>
                  <Button
                    size="sm"
                    variant={onlyUnread ? 'default' : 'ghost'}
                    aria-pressed={onlyUnread}
                    onClick={() => setOnlyUnread(true)}
                  >
                    Não lidas <span className="tabular-nums">{unreadConversations}</span>
                  </Button>
                  <LabelMenu />
                </fieldset>
              )}
            </div>
            <div
              aria-busy={initialLoading || !!loadingMore}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              {initialLoading ? (
                <ConversationListSkeleton />
              ) : filtered.length > 0 ? (
                <ul className="p-2">
                  {filtered.map((conversation) => {
                    const lastMessage = conversation.lastMessage
                    const draft = drafts[`${conversation.sessionId}/${conversation.id}`]
                    const contact = conversation.contact
                    const actions = [
                      {
                        label: 'Etiquetas',
                        Icon: Tags,
                        variant: 'default' as const,
                        onClick: () => setLabelTarget(conversation.id),
                      },
                      {
                        label: selectedIds.includes(conversation.id)
                          ? 'Desmarcar conversa'
                          : 'Selecionar conversa',
                        Icon: CheckSquare,
                        variant: 'default' as const,
                        onClick: () => toggleSelection(conversation.id),
                      },
                      {
                        label:
                          conversation.unreadCount > 0
                            ? 'Marcar como lida'
                            : 'Marcar como não lida',
                        Icon: conversation.unreadCount > 0 ? MailOpen : Mail,
                        variant: 'default' as const,
                        onClick: () => {
                          void markReadState({
                            conversationIds: [conversation.id],
                            read: conversation.unreadCount > 0,
                          })
                        },
                      },
                      ...(contact
                        ? [
                            {
                              label: contact.isSaved ? 'Editar contato' : 'Salvar contato',
                              Icon: contact.isSaved ? Pencil : UserPlus,
                              variant: 'default' as const,
                              onClick: () => {
                                onSelect(conversation.id)
                                setContactPanel({
                                  sessionId: conversation.sessionId,
                                  conversationId: conversation.id,
                                  mediaMessageId: null,
                                })
                                setContactForm({
                                  surface: 'panel',
                                  contactId: contact.id,
                                  name: contact.localName ?? contact.displayName,
                                  phoneNumber: contact.phoneNumber ?? '',
                                  saved: contact.isSaved,
                                  email: contact.email ?? '',
                                  annotations: contact.annotations ?? '',
                                })
                              },
                            },
                          ]
                        : []),
                      {
                        label: 'Excluir conversa',
                        Icon: Trash2,
                        variant: 'destructive' as const,
                        onClick: () => setDeleteIds([conversation.id]),
                      },
                    ]
                    return (
                      <li key={conversation.id} className="flex items-center">
                        <ContextMenu>
                          <ContextMenuTrigger
                            render={<div />}
                            className={cn(
                              'group relative min-w-0 flex-1 rounded-lg transition-colors hover:bg-muted focus-within:bg-muted',
                              (selecting
                                ? selectedIds.includes(conversation.id)
                                : selectedId === conversation.id) &&
                                'bg-primary/10 hover:bg-primary/15 focus-within:bg-primary/15',
                            )}
                          >
                            <button
                              type="button"
                              aria-pressed={
                                selecting ? selectedIds.includes(conversation.id) : undefined
                              }
                              aria-label={
                                selecting
                                  ? `Selecionar conversa com ${conversation.displayName}`
                                  : undefined
                              }
                              aria-current={
                                !selecting && selectedId === conversation.id ? 'true' : undefined
                              }
                              disabled={selecting && busy}
                              onClick={() =>
                                selecting
                                  ? toggleSelection(conversation.id)
                                  : onSelect(conversation.id)
                              }
                              className="flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-4 text-left focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px]"
                            >
                              {selecting && (
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded border border-muted-foreground',
                                    selectedIds.includes(conversation.id) &&
                                      'border-primary bg-primary text-primary-foreground',
                                  )}
                                >
                                  {selectedIds.includes(conversation.id) && (
                                    <Check className="size-3" />
                                  )}
                                </span>
                              )}
                              <ConversationAvatar conversation={conversation} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2 pr-7">
                                  <span
                                    className={cn(
                                      'truncate text-sm font-medium',
                                      conversation.unreadCount > 0 && 'font-semibold',
                                    )}
                                  >
                                    {conversation.displayName}
                                  </span>
                                  {lastMessage && (
                                    <time
                                      dateTime={lastMessage.orderAt}
                                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                                    >
                                      {formatMessageTime(lastMessage.orderAt)}
                                    </time>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <p className="truncate text-xs leading-5 text-muted-foreground">
                                    {selectedId !== conversation.id && draft?.trim() ? (
                                      <>
                                        <span className="font-semibold text-foreground">
                                          Rascunho:
                                        </span>{' '}
                                        <span>{draft.replace(/\s+/g, ' ').trim()}</span>
                                      </>
                                    ) : (
                                      messagePreview(lastMessage)
                                    )}
                                  </p>
                                  {conversation.unreadCount > 0 && (
                                    <span
                                      role="status"
                                      aria-label={`${conversation.unreadCount} mensagens não lidas`}
                                      className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                                    >
                                      {conversation.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <LabelBadges labelIds={conversation.labelIds} singleLine />
                              </div>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Ações da conversa com ${conversation.displayName}`}
                                  disabled={busy}
                                  className="absolute right-2 top-3 size-7 text-muted-foreground transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:opacity-0"
                                >
                                  <ChevronDown aria-hidden="true" className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                aria-label={`Ações da conversa com ${conversation.displayName}`}
                              >
                                {actions.map(({ label, Icon, variant, onClick }) => (
                                  <DropdownMenuItem
                                    key={label}
                                    variant={variant}
                                    onClick={onClick}
                                    disabled={busy}
                                  >
                                    <Icon aria-hidden="true" />
                                    {label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </ContextMenuTrigger>
                          <ContextMenuContent
                            aria-label={`Ações da conversa com ${conversation.displayName}`}
                          >
                            {actions.map(({ label, Icon, variant, onClick }) => (
                              <ContextMenuItem
                                key={label}
                                variant={variant}
                                onClick={onClick}
                                disabled={busy}
                              >
                                <Icon aria-hidden="true" />
                                {label}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuContent>
                        </ContextMenu>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div
                  role="status"
                  className="flex flex-col items-center gap-3 px-6 py-12 text-center"
                >
                  <SearchX aria-hidden="true" className="size-7 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {onlyUnread && !query ? 'Tudo em dia' : 'Nenhuma conversa encontrada'}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {onlyUnread && !query
                      ? 'Você não tem conversas não lidas.'
                      : 'Tente outro nome, telefone ou JID.'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('')
                      setOnlyUnread(false)
                      setLabelFilter(null)
                    }}
                  >
                    Ver todas as conversas
                  </Button>
                </div>
              )}
              {!initialLoading && loadingMore && <ConversationListSkeleton loadingMore />}
              {!initialLoading && hasMore && !loadingMore && (
                <Button className="w-full" variant="ghost" onClick={onLoadMore}>
                  Carregar mais conversas
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <DeleteConversationDialog
        conversations={conversations.filter((conversation) => deleteIds.includes(conversation.id))}
      />
      <ContactFormDialog />
      <DeleteContactDialog />
      <LabelManager />
      <LabelEditorDialog />
      <BulkLabelsDialog />
    </aside>
  )
}
