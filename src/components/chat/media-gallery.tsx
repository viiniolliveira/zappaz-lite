import { type ExtractAtomValue, useAtomValue } from 'jotai'
import { Download, History, Loader2, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { chatMediaGalleryAtom } from '@/atoms/chat-media-gallery'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatMedia } from '@/hooks/use-chat-media'
import { type ChatMediaMessage, getChatMediaMessages, isPdfMedia } from '@/lib/chat/media-library'
import { mergeMessages } from '@/lib/chat/merge'
import type { ChatMessage } from '@/lib/chat/types'
import { contactInitials } from '@/lib/chat/types'
import ContactAvatar from './contact-avatar'
import MediaGalleryCarousel from './media-gallery-carousel'
import MediaGalleryPreview from './media-gallery-preview'
import MediaGalleryThumbnails from './media-gallery-thumbnails'
import PdfViewer from './pdf-viewer'

interface MediaGalleryProps {
  messages: ChatMessage[]
  sessionId: string
  conversationId: string
  displayName: string
  avatarUrl?: string | null
  initialMessageId: string
  initialBlob: Blob | null
  onClose: () => void
  onRestoreFocus: () => void
}

export default function MediaGallery(props: MediaGalleryProps) {
  const selected = getChatMediaMessages(props.messages, props.sessionId, props.conversationId).find(
    (message) => message.id === props.initialMessageId,
  )
  if (selected && isPdfMedia(selected.media)) return <PdfViewer {...props} message={selected} />
  return <ConversationGallery {...props} />
}

function ConversationGallery(props: MediaGalleryProps) {
  const media = useAtomValue(
    chatMediaGalleryAtom({ sessionId: props.sessionId, conversationId: props.conversationId }),
  )
  const messages = useMemo(
    () =>
      getChatMediaMessages(
        mergeMessages(
          props.messages.filter((message) => message.id === props.initialMessageId),
          media.data?.pages.flatMap((page) => page.data.map((item) => item.message)) ?? [],
          props.sessionId,
          props.conversationId,
        ),
        props.sessionId,
        props.conversationId,
      ),
    [props.messages, props.initialMessageId, props.sessionId, props.conversationId, media.data],
  )
  if (!messages.length) return null
  return <GalleryContent {...props} mediaMessages={messages} media={media} />
}

function GalleryContent({
  mediaMessages: messages,
  ...props
}: MediaGalleryProps & {
  mediaMessages: ChatMediaMessage[]
  media: ExtractAtomValue<ReturnType<typeof chatMediaGalleryAtom>>
}) {
  const [selectedId, setSelectedId] = useState(props.initialMessageId)
  const message = messages.find((item) => item.id === selectedId) ?? messages[0]
  return (
    <SelectedGalleryContent
      {...props}
      mediaMessages={messages}
      message={message}
      onSelect={setSelectedId}
    />
  )
}

function SelectedGalleryContent({
  mediaMessages: messages,
  displayName,
  avatarUrl,
  initialMessageId,
  initialBlob,
  media,
  onClose,
  onRestoreFocus,
  message,
  onSelect,
}: MediaGalleryProps & {
  mediaMessages: ChatMediaMessage[]
  media: ExtractAtomValue<ReturnType<typeof chatMediaGalleryAtom>>
  message: ChatMediaMessage
  onSelect: (id: string) => void
}) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openedPdfId, setOpenedPdfId] = useState<string | null>(null)
  const pdfTrigger = useRef<HTMLButtonElement>(null)
  const index = messages.indexOf(message)
  const { elementRef, blob, url, state, retry } = useChatMedia(
    message.media,
    true,
    message.id === initialMessageId ? initialBlob : null,
    'immediate',
  )
  const sender = message.fromMe ? 'Você' : (message.sender.name ?? displayName)
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(message.sentAt ?? message.orderAt),
  )

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            onRestoreFocus()
          }}
          onKeyDownCapture={(event) => {
            if (
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              (event.target instanceof HTMLElement &&
                event.target.closest(
                  'video, audio, iframe, input, textarea, select, [data-slot=video-player-pro], [data-slot=message-audio]',
                ))
            )
              return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            event.stopPropagation()
            const next = messages[index + (event.key === 'ArrowLeft' ? -1 : 1)]
            if (next) onSelect(next.id)
          }}
          className="fixed inset-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none sm:max-w-none data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
          data-slot="media-gallery"
        >
          <DialogTitle className="sr-only">Mídias de {displayName}</DialogTitle>
          <DialogDescription className="sr-only">
            Navegue pelos áudios, imagens, vídeos e documentos desta conversa. Use as setas para
            navegar e Escape para fechar.
          </DialogDescription>
          <header className="flex shrink-0 items-center gap-3 border-b px-3 py-3 md:px-6">
            <ContactAvatar
              initials={contactInitials(sender)}
              avatarUrl={message.fromMe ? null : (avatarUrl ?? null)}
              className="size-9 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{sender}</p>
              <p className="truncate text-xs text-muted-foreground">
                {date} · {displayName}
              </p>
            </div>
            <span role="status" className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {media.data
                ? `${media.data.pages[0].count} mídias`
                : media.isError
                  ? 'Total indisponível'
                  : 'Carregando total…'}
            </span>
            {url ? (
              <Button variant="ghost" size="icon" asChild>
                <a
                  href={url}
                  download={message.media.fileName ?? `arquivo-${message.id}`}
                  aria-label="Baixar arquivo"
                  title="Baixar arquivo"
                >
                  <Download aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Button variant="ghost" size="icon" disabled aria-label="Baixar arquivo">
                <Download aria-hidden="true" />
              </Button>
            )}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Fechar galeria"
                title="Fechar galeria"
              >
                <X aria-hidden="true" />
              </Button>
            </DialogClose>
          </header>
          <MediaGalleryCarousel messages={messages} selectedId={message.id} onSelect={onSelect}>
            <MediaGalleryPreview
              key={message.id}
              message={message}
              url={url}
              blob={blob}
              audioSender={{ name: sender, avatarUrl: message.fromMe ? null : (avatarUrl ?? null) }}
              state={state}
              elementRef={elementRef}
              onRetry={retry}
              onOpenPdf={() => setOpenedPdfId(message.id)}
              pdfTriggerRef={pdfTrigger}
            />
          </MediaGalleryCarousel>
          <div className="flex h-12 shrink-0 items-center justify-center px-4">
            <p className="max-h-full overflow-y-auto text-center text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
              {message.text ?? message.media.fileName}
            </p>
          </div>
          {loadError && (
            <p role="alert" className="px-4 py-1 text-center text-xs text-destructive">
              {loadError}
            </p>
          )}
          {media.isError && !loadError && (
            <div role="alert" className="px-4 py-1 text-center text-xs text-destructive">
              Não foi possível carregar as mídias.
              <Button variant="ghost" size="sm" onClick={() => void media.refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}
          <footer className="flex shrink-0 items-center gap-3 border-t px-3 py-3 md:px-6">
            {media.hasNextPage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-16 w-10 shrink-0 rounded-md bg-muted/30 text-muted-foreground hover:text-foreground md:h-20 md:w-12"
                      disabled={media.isFetching}
                      aria-busy={media.isFetchingNextPage}
                      aria-label={
                        media.isFetchingNextPage
                          ? 'Carregando mídias anteriores'
                          : 'Carregar mídias anteriores'
                      }
                      onClick={async () => {
                        setLoadError(null)
                        try {
                          await media.fetchNextPage({ throwOnError: true, cancelRefetch: false })
                        } catch (error) {
                          setLoadError(
                            error instanceof Error
                              ? error.message
                              : 'Não foi possível carregar mídias anteriores.',
                          )
                        }
                      }}
                    >
                      {media.isFetchingNextPage ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      ) : (
                        <History aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={8}
                    className="bg-foreground [&_svg]:bg-foreground [&_svg]:fill-foreground"
                  >
                    Carregar mídias anteriores
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <MediaGalleryThumbnails
              messages={messages}
              selectedId={message.id}
              onSelect={onSelect}
            />
            {media.isPending && (
              <div role="status" aria-busy="true" className="flex min-w-0 gap-2 overflow-hidden">
                <span className="sr-only">Carregando miniaturas…</span>
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton
                    key={index}
                    aria-hidden="true"
                    className="size-16 shrink-0 md:size-20 motion-reduce:animate-none"
                  />
                ))}
              </div>
            )}
          </footer>
        </DialogContent>
      </Dialog>
      {openedPdfId === message.id && isPdfMedia(message.media) && (
        <PdfViewer
          message={message}
          displayName={displayName}
          avatarUrl={avatarUrl}
          initialBlob={blob}
          onClose={() => setOpenedPdfId(null)}
          onRestoreFocus={() => pdfTrigger.current?.focus({ preventScroll: true })}
        />
      )}
    </>
  )
}
