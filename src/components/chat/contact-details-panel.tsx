import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, Images, Mail, Pencil, Phone, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import { chatContactMediaMessageAtom } from '@/atoms/chat-contact-details'
import { chatContactMutationAtom } from '@/atoms/chat-contacts'
import {
  chatContactFormAtom,
  chatContactLibraryKindAtom,
  chatContactLibraryOpenAtom,
  chatContactPanelAtom,
  chatDeleteConversationIdsAtom,
} from '@/atoms/ui'
import { Button } from '@/components/ui/button'
import type { LibraryEntry } from '@/lib/chat/schemas'
import { type ChatConversation, contactInitials } from '@/lib/chat/types'
import ChatLibrary from './chat-library'
import ChatLibraryDialog from './chat-library-dialog'
import ContactAvatar from './contact-avatar'
import ContactForm from './contact-form'
import ContactLibrarySummary from './contact-library-summary'
import LabelBadges from './label-badges'
import MediaGallery from './media-gallery'

interface ContactDetailsPanelProps {
  conversation: ChatConversation
  onClose: () => void
}

export default function ContactDetailsPanel({ conversation, onClose }: ContactDetailsPanelProps) {
  const [panel, setPanel] = useAtom(chatContactPanelAtom)
  const [form, setForm] = useAtom(chatContactFormAtom)
  const [libraryPanel, setLibraryPanel] = useAtom(chatContactLibraryOpenAtom)
  const [librarySelection, setLibrarySelection] = useAtom(chatContactLibraryKindAtom)
  const [allChats, setAllChats] = useState(false)
  const [initialMedia, setInitialMedia] = useState<{ messageId: string; blob: Blob | null } | null>(
    null,
  )
  const setDelete = useSetAtom(chatDeleteConversationIdsAtom)
  const denied = useAtomValue(chatAccessDeniedAtom)
  const { isPending: saving } = useAtomValue(chatContactMutationAtom)
  const selected = useAtomValue(chatContactMediaMessageAtom)
  const heading = useRef<HTMLHeadingElement>(null)
  const mediaTrigger = useRef<HTMLButtonElement | null>(null)
  const contact = conversation.contact
  const editing = form?.surface === 'panel' && form.contactId === contact?.id
  const browsing =
    libraryPanel?.sessionId === conversation.sessionId &&
    libraryPanel.conversationId === conversation.id &&
    !editing
  const kind =
    librarySelection?.sessionId === conversation.sessionId &&
    librarySelection.conversationId === conversation.id
      ? librarySelection.kind
      : 'media'
  const selectedMessage =
    panel?.mediaMessageId &&
    selected.data?.sessionId === conversation.sessionId &&
    selected.data.conversationId === conversation.id &&
    selected.data.id === panel.mediaMessageId
      ? selected.data
      : null

  useEffect(() => {
    if (!editing) heading.current?.focus({ preventScroll: true })
  }, [editing])

  const closePanel = () => {
    setLibraryPanel(null)
    onClose()
  }
  const openLibrary = () => {
    heading.current?.focus({ preventScroll: true })
    setLibraryPanel({ sessionId: conversation.sessionId, conversationId: conversation.id })
  }
  const openMedia = (entry: LibraryEntry, trigger: HTMLButtonElement, blob: Blob | null) => {
    if (denied) return
    setInitialMedia({ messageId: entry.message.id, blob })
    mediaTrigger.current = trigger
    setPanel((current) => (current ? { ...current, mediaMessageId: entry.message.id } : current))
  }

  const edit = () => {
    if (!contact || denied) return
    setPanel((current) => (current ? { ...current, mediaMessageId: null } : current))
    setForm({
      surface: 'panel',
      contactId: contact.id,
      name: contact.localName ?? contact.displayName,
      phoneNumber: contact.phoneNumber ?? '',
      saved: contact.isSaved,
      email: contact.email ?? '',
      annotations: contact.annotations ?? '',
    })
  }
  const closeGallery = () => {
    setInitialMedia(null)
    setPanel((current) => (current ? { ...current, mediaMessageId: null } : current))
  }

  return (
    <aside
      aria-label={browsing ? 'Biblioteca da conversa' : 'Informações do contato'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !panel?.mediaMessageId && !saving && !allChats) {
          event.preventDefault()
          event.stopPropagation()
          if (editing) setForm(null)
          else if (browsing) setLibraryPanel(null)
          else closePanel()
        }
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col border-l bg-background xl:w-90 xl:flex-none"
    >
      <header className="flex h-18 shrink-0 items-center gap-2 border-b px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            editing || browsing
              ? 'Voltar para informações do contato'
              : 'Fechar informações do contato'
          }
          disabled={saving}
          onClick={() =>
            editing ? setForm(null) : browsing ? setLibraryPanel(null) : closePanel()
          }
        >
          {editing || browsing ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}
        </Button>
        <h2
          ref={heading}
          tabIndex={-1}
          className="min-w-0 flex-1 text-sm font-semibold outline-none"
        >
          {editing
            ? contact?.isSaved
              ? 'Editar contato'
              : 'Salvar contato'
            : browsing
              ? 'Mídia, links e documentos'
              : 'Informações do contato'}
        </h2>
        {!editing && !browsing && contact?.isSaved && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Editar contato"
            disabled={denied || saving}
            onClick={edit}
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
      </header>
      {browsing ? (
        <>
          <ChatLibrary
            sessionId={conversation.sessionId}
            conversationId={conversation.id}
            kind={kind}
            onKindChange={(next) =>
              setLibrarySelection({
                sessionId: conversation.sessionId,
                conversationId: conversation.id,
                kind: next,
              })
            }
            onOpen={openMedia}
          />
          <div className="shrink-0 border-t p-3">
            <Button
              variant="ghost"
              className="h-auto w-full whitespace-normal text-foreground"
              disabled={denied}
              onClick={() => setAllChats(true)}
            >
              <Images aria-hidden="true" />
              Ver mídias de todas as conversas
            </Button>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {editing ? (
            <div className="space-y-5 p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Dados salvos somente no Zappaz. Nada será alterado no WhatsApp.
              </p>
              <ContactForm key={contact?.id} />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <ContactAvatar
                  initials={contactInitials(conversation.displayName)}
                  avatarUrl={conversation.avatarUrl}
                  className="size-28 text-3xl"
                />
                <h3 className="mt-5 w-full text-xl font-semibold [overflow-wrap:anywhere]">
                  {conversation.displayName}
                </h3>
                <LabelBadges labelIds={conversation.labelIds} />
                <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {contact?.phoneNumber ? `+${contact.phoneNumber}` : 'Telefone indisponível'}
                </p>
                {contact && !contact.isSaved && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={denied || saving}
                    onClick={edit}
                  >
                    <UserPlus aria-hidden="true" />
                    Salvar contato
                  </Button>
                )}
              </div>
              <dl className="space-y-5 border-t px-5 py-6 text-sm">
                <div>
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone aria-hidden="true" className="size-3.5" />
                    Telefone
                  </dt>
                  <dd className="mt-1.5 [overflow-wrap:anywhere]">
                    {contact?.phoneNumber
                      ? `+${contact.phoneNumber}`
                      : 'Não informado pelo WhatsApp'}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail aria-hidden="true" className="size-3.5" />
                    Email
                  </dt>
                  <dd className="mt-1.5 [overflow-wrap:anywhere]">
                    {contact?.email || 'Não informado'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Anotações</dt>
                  <dd className="mt-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {contact?.annotations || 'Nenhuma anotação'}
                  </dd>
                </div>
              </dl>
              <ContactLibrarySummary
                key={`${conversation.sessionId}/${conversation.id}`}
                onOpen={openLibrary}
                onOpenMedia={openMedia}
              />
              <div className="px-5">
                {panel?.mediaMessageId && selected.isPending && (
                  <p role="status" className="text-xs text-muted-foreground">
                    Abrindo mídia…
                  </p>
                )}
                {panel?.mediaMessageId && (selected.isError || selectedMessage?.deletedAt) && (
                  <div role="alert" className="space-y-2 text-xs text-destructive">
                    <p>Não foi possível abrir esta mídia.</p>
                    <Button type="button" variant="outline" size="sm" onClick={closeGallery}>
                      Fechar prévia
                    </Button>
                  </div>
                )}
              </div>
              <div className="border-t p-5">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={denied}
                  className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDelete([conversation.id])}
                >
                  <Trash2 aria-hidden="true" />
                  Excluir conversa
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Remove o histórico e as mídias somente do Zappaz. O contato será mantido.
                </p>
              </div>
            </>
          )}
        </div>
      )}
      {browsing && panel?.mediaMessageId && selected.isPending && (
        <p role="status" className="px-5 py-2 text-xs text-muted-foreground">
          Abrindo mídia…
        </p>
      )}
      {browsing && panel?.mediaMessageId && (selected.isError || selectedMessage?.deletedAt) && (
        <div role="alert" className="px-5 py-2 text-xs text-destructive">
          <p>Não foi possível abrir esta mídia.</p>
          <Button variant="outline" size="sm" onClick={closeGallery}>
            Fechar prévia
          </Button>
        </div>
      )}
      {allChats && !denied && (
        <ChatLibraryDialog
          key={conversation.sessionId}
          sessionId={conversation.sessionId}
          initialKind={kind}
          onClose={() => setAllChats(false)}
        />
      )}
      {selectedMessage && !selectedMessage.deletedAt && !denied && (
        <MediaGallery
          key={`${conversation.sessionId}/${conversation.id}/${selectedMessage.id}`}
          messages={[selectedMessage]}
          sessionId={conversation.sessionId}
          conversationId={conversation.id}
          displayName={conversation.displayName}
          avatarUrl={conversation.avatarUrl}
          initialMessageId={selectedMessage.id}
          initialBlob={initialMedia?.messageId === selectedMessage.id ? initialMedia.blob : null}
          onClose={closeGallery}
          onRestoreFocus={() => {
            if (mediaTrigger.current?.isConnected)
              mediaTrigger.current.focus({ preventScroll: true })
            else heading.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </aside>
  )
}
