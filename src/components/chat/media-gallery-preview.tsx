import { FileText, Loader2 } from 'lucide-react'
import { type RefObject, useState } from 'react'
import { VideoPlayerPro } from '@/components/ruixen/video-player-pro'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { type ChatMediaMessage, isPdfMedia, mediaThumbnail } from '@/lib/chat/media-library'
import MessageAudio, { type AudioSender } from './messages/message-audio'

export default function MediaGalleryPreview({
  message,
  url,
  state,
  elementRef,
  onRetry,
  onOpenPdf,
  pdfTriggerRef,
  blob = null,
  audioSender,
}: {
  message: ChatMediaMessage
  url: string | null
  state: 'idle' | 'loading' | 'ready' | 'error'
  elementRef: RefObject<HTMLDivElement | null>
  onRetry: () => void
  onOpenPdf?: () => void
  pdfTriggerRef?: RefObject<HTMLButtonElement | null>
  blob?: Blob | null
  audioSender?: AudioSender
}) {
  const [failed, setFailed] = useState(false)
  const preview = mediaThumbnail(message)
  const loading = !url && state !== 'error'
  const error = state === 'error' || failed
  const showSkeleton =
    loading && !error && !preview && (message.type === 'image' || message.type === 'video')
  return (
    <div
      ref={elementRef}
      className="relative flex size-full min-h-0 items-center justify-center overflow-auto px-3 py-2 md:px-20"
      data-slot="media-gallery-preview"
    >
      {!error && message.type === 'image' && (url || preview) && (
        <img
          src={url ?? preview}
          alt={message.media.fileName ?? message.text ?? 'Imagem da conversa'}
          className="max-h-full max-w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
      {!error &&
        message.type === 'video' &&
        (url ? (
          <VideoPlayerPro
            src={url}
            poster={preview}
            label={message.media.fileName ?? 'Vídeo da conversa'}
            onRetry={onRetry}
          />
        ) : (
          preview && (
            <img
              src={preview}
              alt="Prévia do vídeo"
              className="max-h-full max-w-full object-contain"
            />
          )
        ))}
      {!error && message.type === 'document' && (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <FileText aria-hidden="true" className="size-14 text-muted-foreground" />
          <p className="max-w-full break-all text-sm font-medium">
            {message.media.fileName ?? 'Documento'}
          </p>
          {isPdfMedia(message.media) && onOpenPdf ? (
            <Button ref={pdfTriggerRef} variant="outline" onClick={onOpenPdf}>
              Abrir PDF
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Baixe o arquivo para abrir no aplicativo compatível.
            </p>
          )}
        </div>
      )}
      {showSkeleton && (
        <div role="status" className="flex size-full items-center justify-center">
          <Skeleton
            className="aspect-video max-h-full w-full max-w-4xl rounded-lg motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span className="sr-only">Carregando arquivo…</span>
        </div>
      )}
      {!error && message.type === 'audio' && url && blob && (
        <MessageAudio media={message.media} sender={audioSender} sourceBlob={blob} />
      )}
      {loading && !error && !showSkeleton && (
        <span
          role="status"
          className="absolute inset-0 flex items-center justify-center gap-2 bg-background/60 text-sm"
        >
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
          Carregando arquivo…
        </span>
      )}
      {error && (
        <div role="alert" className="flex flex-col items-center gap-3 text-center text-sm">
          <p>Não foi possível abrir o arquivo.</p>
          <Button
            variant="outline"
            onClick={() => {
              setFailed(false)
              onRetry()
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  )
}
