import { Download, Loader2, X } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useChatMedia } from '@/hooks/use-chat-media'
import type { ChatMediaMessage } from '@/lib/chat/media-library'
import { contactInitials } from '@/lib/chat/types'
import ContactAvatar from './contact-avatar'

const PdfDocument = lazy(() => import('./pdf-document'))

export default function PdfViewer({
  message,
  initialBlob,
  displayName,
  avatarUrl,
  onClose,
  onRestoreFocus,
}: {
  message: ChatMediaMessage
  initialBlob: Blob | null
  displayName: string
  avatarUrl?: string | null
  onClose: () => void
  onRestoreFocus: () => void
}) {
  const { blob, url, state, retry } = useChatMedia(message.media, true, initialBlob, 'immediate')
  const name = message.media.fileName ?? 'Documento.pdf'
  const sender = message.fromMe ? 'Você' : (message.sender.name ?? displayName)
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(message.sentAt ?? message.orderAt),
  )
  return (
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
        className="dark fixed inset-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground shadow-none scheme-dark sm:max-w-none data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100"
        data-slot="pdf-viewer"
      >
        <DialogTitle className="sr-only">Visualizador de PDF: {name}</DialogTitle>
        <DialogDescription className="sr-only">
          Leia o documento, navegue pelas páginas e ajuste o zoom. Pressione Escape para fechar.
        </DialogDescription>
        <header className="flex shrink-0 items-center gap-3 border-b px-3 py-3 md:px-6">
          <ContactAvatar
            initials={contactInitials(sender)}
            avatarUrl={message.fromMe ? null : (avatarUrl ?? null)}
            className="size-9 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={`${sender} · ${name}`}>
              {sender} · {name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{date}</p>
          </div>
          {url ? (
            <Button variant="ghost" size="icon" asChild>
              <a href={url} download={name} aria-label="Baixar PDF" title="Baixar PDF">
                <Download aria-hidden="true" />
              </a>
            </Button>
          ) : (
            <Button variant="ghost" size="icon" disabled aria-label="Baixar PDF">
              <Download aria-hidden="true" />
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Fechar PDF" title="Fechar PDF">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {state === 'error' ? (
            <div
              role="alert"
              className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center text-sm"
            >
              <p>Não foi possível baixar o PDF.</p>
              <Button variant="outline" onClick={retry}>
                Tentar novamente
              </Button>
            </div>
          ) : blob ? (
            <Suspense fallback={<PdfLoading />}>
              <PdfDocument key={message.id} blob={blob} />
            </Suspense>
          ) : (
            <PdfLoading />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PdfLoading() {
  return (
    <div
      role="status"
      className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" />
      Carregando PDF…
    </div>
  )
}
