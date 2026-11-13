import { Download, File, Image, Loader2, Play, Video } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useChatMedia } from '@/hooks/use-chat-media'
import { formatTime } from '@/lib/audio/time'
import type { MediaDTO } from '@/lib/chat/schemas'
import { cn } from '@/lib/utils'
import MessageAudio, { type AudioSender } from './message-audio'
import MessageDocument from './message-document'

export default function MessageMedia({
  media,
  sender,
  overlay,
  tile = false,
  fullWidth = false,
  onOpen,
}: {
  media: MediaDTO
  sender?: AudioSender
  overlay?: ReactNode
  tile?: boolean
  fullWidth?: boolean
  onOpen?: (blob: Blob | null) => void
}) {
  if (media.kind === 'audio') return <MessageAudio media={media} sender={sender} />
  if (media.kind === 'document')
    return <MessageDocument media={media} onOpen={onOpen} metadata={overlay} />
  return (
    <MessageFile
      media={media}
      overlay={overlay}
      tile={tile}
      fullWidth={fullWidth}
      onOpen={media.kind !== 'sticker' ? onOpen : undefined}
    />
  )
}

function MessageFile({
  media,
  overlay,
  tile,
  fullWidth,
  onOpen,
}: {
  media: MediaDTO
  overlay?: ReactNode
  tile: boolean
  fullWidth: boolean
  onOpen?: (blob: Blob | null) => void
}) {
  const [requested, setRequested] = useState(false)
  const [playerError, setPlayerError] = useState(false)
  const [failedImages, setFailedImages] = useState<string[]>([])
  const [naturalSize, setNaturalSize] = useState<{
    src: string
    width: number
    height: number
  } | null>(null)
  const visual = media.kind === 'image' || media.kind === 'sticker'
  const { elementRef, url, blob, state, retry } = useChatMedia(media, visual || requested)
  const preview = media.thumbnail
    ? `data:${media.thumbnail.mimeType};base64,${media.thumbnail.base64}`
    : null
  const availablePreview = preview && !failedImages.includes(preview) ? preview : null
  const imageSource = url && !failedImages.includes(url) ? url : availablePreview
  const hasImage = media.kind === 'image' && !!imageSource
  const hasError = state === 'error' || playerError || failedImages.length > 0
  const framed = media.kind === 'image' || media.kind === 'video'
  const fillFrame = framed && fullWidth && !tile
  const imageFrame = media.kind === 'image' && !tile && !fillFrame && !!imageSource && !hasError
  const loadedSize = naturalSize?.src === imageSource ? naturalSize : null
  const width =
    media.width && media.height ? media.width : (loadedSize?.width ?? media.thumbnail?.width)
  const height =
    media.width && media.height ? media.height : (loadedSize?.height ?? media.thumbnail?.height)
  const imageRatio = width && height && width > 0 && height > 0 ? width / height : 1
  const imageWidth =
    media.width && media.height
      ? Math.min(Math.max(media.width, 280), 384, 320 * imageRatio)
      : availablePreview
        ? Math.min(320, 384, 320 * imageRatio)
        : Math.min(Math.max(loadedSize?.width ?? 280, 280), 384, 320 * imageRatio)
  const retryMedia = () => {
    setPlayerError(false)
    setFailedImages([])
    retry()
  }
  const downloadLabel = state === 'error' ? 'Tentar baixar novamente' : 'Abrir arquivo'
  const downloadButton = !url && !onOpen && (
    <Button
      variant="outline"
      size={tile ? 'icon' : 'sm'}
      aria-label={downloadLabel}
      title={downloadLabel}
      className={
        tile
          ? 'absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 border-white/30 bg-black/60 text-white hover:bg-black/80 hover:text-white'
          : undefined
      }
      disabled={state === 'loading'}
      onClick={() => {
        setRequested(true)
        retry()
      }}
    >
      {state === 'loading' ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : tile ? (
        <Download aria-hidden="true" className="size-4" />
      ) : (
        <Image aria-hidden="true" className="size-4" />
      )}
      {!tile && downloadLabel}
    </Button>
  )
  return (
    <div
      ref={elementRef}
      className={cn(
        tile
          ? 'min-w-0 space-y-2'
          : fillFrame
            ? 'w-full min-w-0 space-y-2'
            : imageFrame
              ? 'max-w-full space-y-2'
              : framed && !hasImage
                ? 'w-[min(20rem,70vw)] max-w-full space-y-2'
                : 'max-w-sm space-y-2',
        framed && hasImage && !imageFrame && !tile && !fillFrame && 'w-fit',
        !framed && 'mb-2',
      )}
      style={imageFrame ? { width: `min(${imageWidth}px, 70vw)` } : undefined}
    >
      <div
        data-slot="message-media-visual"
        className={cn(
          'relative max-w-full',
          tile
            ? 'aspect-square w-full overflow-hidden rounded-md bg-muted'
            : imageFrame
              ? 'w-full overflow-hidden rounded-md bg-muted'
              : fillFrame
                ? 'w-full overflow-hidden rounded-md'
                : framed && !hasImage
                  ? 'w-full overflow-hidden rounded-md bg-muted'
                  : 'w-fit',
        )}
        style={imageFrame ? { aspectRatio: imageRatio } : undefined}
      >
        {visual && imageSource ? (
          <img
            src={imageSource}
            alt={
              media.fileName ??
              (media.kind === 'sticker' ? 'Figurinha recebida' : 'Imagem recebida')
            }
            className={cn(
              'block max-w-full',
              (fillFrame || imageFrame) && 'w-full',
              imageFrame && 'h-full',
              tile ? 'size-full object-cover' : 'object-contain',
              media.kind === 'sticker' ? 'max-h-48 max-w-48' : !tile && 'max-h-80 rounded-md',
            )}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              if (naturalWidth && naturalHeight) {
                setNaturalSize({ src: imageSource, width: naturalWidth, height: naturalHeight })
              }
            }}
            onError={() => setFailedImages((failed) => [...failed, imageSource])}
          />
        ) : media.kind === 'video' && url && !onOpen ? (
          <video
            controls
            preload="metadata"
            src={url}
            className={cn(
              'block max-w-full rounded-md',
              fillFrame && 'w-full',
              tile ? 'size-full object-cover' : 'max-h-80',
            )}
            onError={() => setPlayerError(true)}
            aria-label="Vídeo recebido"
          >
            <track kind="captions" />
          </video>
        ) : availablePreview ? (
          <img
            src={availablePreview}
            alt="Prévia da mídia"
            className={cn(
              'block rounded-md',
              tile
                ? 'size-full object-cover'
                : framed
                  ? 'w-full max-h-80 object-contain'
                  : 'max-h-52 object-contain',
            )}
            onError={() => setFailedImages((failed) => [...failed, availablePreview])}
          />
        ) : (
          <div
            className={cn(
              'flex min-h-20 items-center gap-2 p-4 text-sm',
              tile
                ? 'size-full justify-center pb-12'
                : framed && 'aspect-video flex-col justify-center pb-10',
              media.kind !== 'sticker' && 'rounded-md bg-muted text-muted-foreground',
            )}
          >
            {media.kind === 'image' ? (
              <Image aria-hidden="true" className="size-6 shrink-0" />
            ) : (
              <File aria-hidden="true" className="size-5 shrink-0" />
            )}
            <span className="max-w-full truncate">
              {media.kind === 'image'
                ? hasError
                  ? 'Imagem indisponível'
                  : state === 'loading'
                    ? 'Carregando imagem…'
                    : 'Imagem'
                : (media.fileName ?? (media.kind === 'video' ? 'Vídeo' : 'Figurinha'))}
            </span>
          </div>
        )}
        {media.kind === 'image' && !hasError && state !== 'ready' && (
          <span
            role="status"
            aria-label="Carregando imagem"
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
          >
            <span className="rounded-full bg-black/60 p-2 text-white">
              <Loader2
                aria-hidden="true"
                className="size-5 animate-spin motion-reduce:animate-none"
              />
            </span>
          </span>
        )}
        {tile && downloadButton}
        {onOpen && (
          <button
            type="button"
            aria-label={`Abrir ${media.kind === 'image' ? 'imagem' : media.kind === 'video' ? 'vídeo' : 'documento'} na galeria`}
            className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onOpen(blob)}
          >
            {media.kind === 'video' && (
              <span className="rounded-full bg-black/60 p-3 text-white">
                <Play aria-hidden="true" className="size-6 fill-current" />
              </span>
            )}
          </button>
        )}
        {overlay}
        {tile && media.kind === 'video' && (
          <span className="pointer-events-none absolute bottom-1.5 left-2 flex items-center gap-1 text-xs text-white">
            <Video aria-hidden="true" className="size-3.5" />
            <span>{formatTime(media.duration ?? 0)}</span>
          </span>
        )}
      </div>
      {!tile && downloadButton}
      {hasError && (
        <div
          role="alert"
          className={cn(
            'space-y-1 px-1 text-xs text-muted-foreground [overflow-wrap:anywhere]',
            framed && !tile && '[contain:inline-size]',
          )}
        >
          <p>
            {availablePreview
              ? 'Não foi possível abrir o arquivo. A prévia continua disponível.'
              : 'Não foi possível carregar o arquivo.'}
          </p>
          <Button
            variant="link"
            size="sm"
            className="h-auto max-w-full p-0 text-left text-xs whitespace-normal"
            onClick={retryMedia}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  )
}
