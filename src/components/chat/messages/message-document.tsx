import { Download, FileText, Loader2 } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useChatMedia } from '@/hooks/use-chat-media'
import { documentSize, documentType } from '@/lib/chat/media-library'
import type { MediaDTO } from '@/lib/chat/schemas'
import { cn } from '@/lib/utils'

export default function MessageDocument({
  media,
  onOpen,
  metadata,
}: {
  media: MediaDTO
  onOpen?: (blob: Blob | null) => void
  metadata?: ReactNode
}) {
  const [requested, setRequested] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const downloadPending = useRef(false)
  const { elementRef, url, blob, state, retry } = useChatMedia(media, requested)
  const name = media.fileName ?? 'Documento'
  const type = documentType(media)
  const size = documentSize(media.size)
  const preview =
    !previewFailed && media.thumbnail
      ? `data:${media.thumbnail.mimeType};base64,${media.thumbnail.base64}`
      : null

  useEffect(() => {
    if (!url || !downloadPending.current) return
    downloadPending.current = false
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
  }, [url, name])

  return (
    <div
      ref={elementRef}
      data-slot="message-document"
      className="w-72 max-w-full overflow-hidden rounded-lg bg-foreground/5"
    >
      {preview && (
        <button
          type="button"
          aria-label={`Abrir ${name}`}
          disabled={!onOpen}
          onClick={() => onOpen?.(blob)}
          className="block w-full cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
        >
          <img
            src={preview}
            alt={`Prévia de ${name}`}
            onError={() => setPreviewFailed(true)}
            className="block h-28 w-full object-cover object-top"
          />
        </button>
      )}
      <div className={cn('flex min-w-0 items-center gap-3 p-3', metadata && 'pb-0')}>
        <div
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 flex-col items-center justify-center rounded-md bg-primary/15 text-primary',
            type === 'PDF' && 'bg-destructive/10 text-destructive',
          )}
        >
          <FileText className="size-5" />
          <span className="max-w-full truncate px-0.5 text-xs font-semibold leading-3">{type}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p title={name} className="line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]">
            {name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {type}
            {size !== null && ` · ${size}`}
          </p>
        </div>
      </div>
      {metadata && <div className="px-3 pb-1.5">{metadata}</div>}
      <div className="flex border-t border-foreground/10">
        <Button
          type="button"
          variant="ghost"
          className="min-w-0 flex-1 rounded-none"
          aria-label={`Abrir ${name}`}
          disabled={!onOpen}
          onClick={() => onOpen?.(blob)}
        >
          Abrir
        </Button>
        {url ? (
          <Button
            variant="ghost"
            className="min-w-0 flex-1 rounded-none border-l border-foreground/10"
            asChild
          >
            <a href={url} download={name} aria-label={`Baixar ${name}`}>
              <Download aria-hidden="true" className="size-4" />
              Baixar
            </a>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="min-w-0 flex-1 rounded-none border-l border-foreground/10"
            aria-label={`Baixar ${name}`}
            disabled={state === 'loading'}
            onClick={() => {
              downloadPending.current = true
              setRequested(true)
              if (state === 'error') retry()
            }}
          >
            {state === 'loading' ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-4" />
            )}
            {state === 'loading' ? 'Baixando…' : 'Baixar'}
          </Button>
        )}
      </div>
      {state === 'error' && (
        <p role="alert" className="px-3 pb-3 text-xs text-destructive">
          Não foi possível baixar o arquivo. Tente novamente em Baixar.
        </p>
      )}
    </div>
  )
}
