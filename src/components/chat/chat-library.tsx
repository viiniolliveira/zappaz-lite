import { useAtomValue } from 'jotai'
import { ExternalLink, FileText, Link as LinkIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import { chatLibraryAtom } from '@/atoms/chat-contact-details'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { groupLibraryEntries, libraryLinks } from '@/lib/chat/library'
import { documentSize, documentType } from '@/lib/chat/media-library'
import type { LibraryEntry, LibraryKind } from '@/lib/chat/schemas'
import { contactInitials } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import ContactAvatar from './contact-avatar'
import LibraryMediaTile from './library-media-tile'
import MessageFormattedText from './messages/message-formatted-text'

const categories: { kind: LibraryKind; label: string; empty: string }[] = [
  { kind: 'media', label: 'Mídia', empty: 'Nenhuma mídia compartilhada.' },
  { kind: 'document', label: 'Documentos', empty: 'Nenhum documento compartilhado.' },
  { kind: 'link', label: 'Links', empty: 'Nenhum link compartilhado.' },
]

function Sender({ entry, allChats }: { entry: LibraryEntry; allChats: boolean }) {
  const sender = entry.message.fromMe
    ? 'Você'
    : entry.message.sender.name || entry.conversation.displayName
  return (
    <div className="flex min-w-0 items-center gap-2">
      {allChats && (
        <ContactAvatar
          initials={contactInitials(entry.conversation.displayName)}
          avatarUrl={entry.conversation.avatarUrl}
          className="size-8 shrink-0 text-xs"
        />
      )}
      <div className="min-w-0 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">
          {allChats ? entry.conversation.displayName : sender}
        </p>
        <p className="[overflow-wrap:anywhere]">
          {allChats && `${sender} · `}
          <time dateTime={entry.message.orderAt}>
            {new Date(entry.message.orderAt).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </p>
      </div>
    </div>
  )
}

function LibraryRow({
  entry,
  kind,
  allChats,
  disabled,
  onOpen,
}: {
  entry: LibraryEntry
  kind: LibraryKind
  allChats: boolean
  disabled: boolean
  onOpen: (entry: LibraryEntry, trigger: HTMLButtonElement, blob: Blob | null) => void
}) {
  const links = kind === 'link' ? libraryLinks(entry) : []
  const media = entry.message.media
  const preview = entry.message.linkPreview
  return (
    <li
      className={cn(
        'grid min-w-0 gap-3 border-b py-4',
        allChats &&
          'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-6',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            'flex size-14 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-md bg-muted text-muted-foreground',
            kind === 'document' &&
              media &&
              (documentType(media) === 'PDF'
                ? 'bg-destructive/10 text-destructive dark:text-foreground'
                : 'bg-primary/15 text-primary'),
          )}
        >
          {kind === 'link' && preview?.thumbnail ? (
            <img
              src={`data:${preview.thumbnail.mimeType};base64,${preview.thumbnail.base64}`}
              alt=""
              className="size-full object-cover"
            />
          ) : kind === 'document' ? (
            <FileText aria-hidden="true" className="size-6" />
          ) : (
            <LinkIcon aria-hidden="true" className="size-6" />
          )}
          {kind === 'document' && media && (
            <span className="max-w-full truncate px-1 text-xs font-medium">
              {documentType(media)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {kind === 'document' ? (
            <>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Abrir documento ${media?.fileName ?? 'Documento'}`}
                onClick={(event) => onOpen(entry, event.currentTarget, null)}
                className="rounded-sm text-left text-sm font-medium outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 [overflow-wrap:anywhere]"
              >
                {media?.fileName ?? 'Documento'}
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                {media &&
                  [documentSize(media.size), documentType(media)].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <>
              {preview?.title && (
                <p
                  title={preview.title}
                  className={cn(
                    'text-sm font-medium',
                    allChats ? 'truncate' : 'line-clamp-2 [overflow-wrap:anywhere]',
                  )}
                >
                  {preview.title}
                </p>
              )}
              {links.map((href) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-start gap-1 rounded-sm text-sm text-foreground underline decoration-primary underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
                >
                  <span className="min-w-0">{href}</span>
                  <ExternalLink aria-hidden="true" className="mt-1 size-3 shrink-0" />
                </a>
              ))}
            </>
          )}
        </div>
      </div>
      <div
        className={cn(
          'min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]',
          kind === 'link' && 'line-clamp-2 whitespace-pre-wrap',
        )}
      >
        {entry.message.text ? (
          <MessageFormattedText text={entry.message.text} links={kind !== 'link'} />
        ) : (
          'Sem legenda'
        )}
      </div>
      <Sender entry={entry} allChats={allChats} />
    </li>
  )
}

export default function ChatLibrary({
  sessionId,
  conversationId,
  kind,
  onKindChange,
  onOpen,
  heading,
}: {
  sessionId: string
  conversationId: string | null
  kind: LibraryKind
  onKindChange: (kind: LibraryKind) => void
  onOpen: (entry: LibraryEntry, trigger: HTMLButtonElement, blob: Blob | null) => void
  heading?: ReactNode
}) {
  const library = useAtomValue(chatLibraryAtom({ sessionId, conversationId, kind }))
  const denied = useAtomValue(chatAccessDeniedAtom)
  const category = categories.find((item) => item.kind === kind) ?? categories[0]
  const entries = [
    ...new Map(
      (library.data?.pages.flatMap((page) => page.data) ?? []).map((entry) => [
        entry.message.id,
        entry,
      ]),
    ).values(),
  ]
  const allChats = conversationId === null
  const groups = groupLibraryEntries(entries, allChats)
  const scrollRoot = useRef<HTMLDivElement>(null)
  const loadMore = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = scrollRoot.current
    const sentinel = loadMore.current
    if (
      denied ||
      library.isFetching ||
      library.isError ||
      !library.data ||
      !library.hasNextPage ||
      !root ||
      root.dataset.libraryKind !== kind ||
      !sentinel
    )
      return
    let requested = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || requested) return
        requested = true
        void library.fetchNextPage()
      },
      { root, rootMargin: '0px 0px 200px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [
    denied,
    kind,
    library.isFetching,
    library.isError,
    library.data,
    library.hasNextPage,
    library.fetchNextPage,
  ])
  return (
    <Tabs
      value={kind}
      onValueChange={(value) => {
        const next = categories.find((item) => item.kind === value)
        if (next) {
          onKindChange(next.kind)
        }
      }}
      className="min-h-0 flex-1 gap-0"
    >
      <div
        className={cn(
          'shrink-0 border-b px-4',
          allChats && 'flex flex-wrap items-center gap-x-6 px-5 pr-14',
        )}
      >
        {heading}
        <TabsList
          variant="line"
          aria-label="Categorias da biblioteca"
          className={cn(
            'w-full p-0 group-data-[orientation=horizontal]/tabs:h-14',
            allChats && 'md:mx-auto md:w-96',
          )}
        >
          {categories.map((item) => (
            <TabsTrigger
              key={item.kind}
              value={item.kind}
              className="h-full rounded-none data-[state=active]:text-foreground after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-0"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent
        ref={scrollRoot}
        data-library-kind={kind}
        key={kind}
        value={kind}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6',
          allChats && kind === 'media' && 'px-0 pb-0',
        )}
      >
        {library.isPending ? (
          <div
            role="status"
            aria-busy="true"
            className={cn(
              'pt-6',
              kind === 'media'
                ? allChats
                  ? 'grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5'
                  : 'grid grid-cols-3 gap-2'
                : 'space-y-3',
            )}
          >
            <span className="sr-only">Carregando {category.label.toLowerCase()}…</span>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton
                key={index}
                aria-hidden="true"
                className={
                  kind === 'media'
                    ? 'aspect-square w-full motion-reduce:animate-none'
                    : 'h-16 w-full motion-reduce:animate-none'
                }
              />
            ))}
          </div>
        ) : (
          <>
            {!entries.length && !library.isError && (
              <p className="py-8 text-center text-sm text-muted-foreground">{category.empty}</p>
            )}
            {allChats && kind !== 'media' && !!entries.length && (
              <div
                aria-hidden="true"
                className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 border-b bg-background py-4 text-xs font-medium md:grid"
              >
                <span>{kind === 'document' ? 'Documento' : 'Link'}</span>
                <span>{kind === 'document' ? 'Legenda' : 'Mensagem'}</span>
                <span>Enviado por</span>
              </div>
            )}
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label} className="pt-6">
                <h3
                  className={cn(
                    'mb-3 text-xs font-medium capitalize text-muted-foreground',
                    allChats && kind === 'media' && 'px-5',
                  )}
                >
                  {group.label}
                </h3>
                {kind === 'media' ? (
                  <div
                    className={
                      allChats
                        ? 'grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5'
                        : 'grid grid-cols-3 gap-2'
                    }
                  >
                    {group.entries.map((entry) => (
                      <LibraryMediaTile
                        key={entry.message.id}
                        entry={entry}
                        showSender={allChats}
                        loadFullMedia={allChats}
                        disabled={denied}
                        onOpen={onOpen}
                      />
                    ))}
                  </div>
                ) : (
                  <ul>
                    {group.entries.map((entry) => (
                      <LibraryRow
                        key={entry.message.id}
                        entry={entry}
                        kind={kind}
                        allChats={allChats}
                        disabled={denied}
                        onOpen={onOpen}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </>
        )}
        {library.isError && (
          <div role="alert" className="space-y-2 py-5 text-xs text-muted-foreground">
            <p>Não foi possível carregar {category.label.toLowerCase()}.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={denied}
              onClick={() => {
                void (library.isFetchNextPageError ? library.fetchNextPage() : library.refetch())
              }}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {library.hasNextPage && !library.isError && (
          <div ref={loadMore} className="h-px" aria-hidden="true" />
        )}
        {library.isFetchingNextPage && (
          <div
            role="status"
            aria-busy="true"
            className="p-4 text-center text-xs text-muted-foreground"
          >
            Carregando mais {category.label.toLowerCase()}…
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
