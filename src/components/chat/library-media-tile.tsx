import { Headphones, Images, Loader2, RotateCcw, Video } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatMedia } from '@/hooks/use-chat-media'
import { formatTime } from '@/lib/audio/time'
import type { LibraryEntry, MediaDTO } from '@/lib/chat/schemas'
import { cn } from '@/lib/utils'

interface LibraryMediaTileProps {
  entry: LibraryEntry
  showSender?: boolean
  loadFullMedia?: boolean
  disabled: boolean
  onOpen: (entry: LibraryEntry, trigger: HTMLButtonElement, blob: Blob | null) => void
}

export default function LibraryMediaTile({
  entry,
  showSender = false,
  loadFullMedia = false,
  disabled,
  onOpen,
}: LibraryMediaTileProps) {
  const media = entry.message.media
  if (!media) return null
  return (
    <MediaTileContent
      key={`${media.sessionId}/${media.conversationId}/${media.id}/${media.contentPath}`}
      entry={entry}
      media={media}
      showSender={showSender}
      loadFullMedia={loadFullMedia}
      disabled={disabled}
      onOpen={onOpen}
    />
  )
}

function MediaTileContent({
  entry,
  media,
  showSender,
  loadFullMedia,
  disabled,
  onOpen,
}: LibraryMediaTileProps & { media: MediaDTO }) {
  const visual = media.kind === 'image' || media.kind === 'video'
  const { elementRef, url, blob, state, retry } = useChatMedia(
    media,
    !!loadFullMedia && visual && !disabled,
  )
  const [failedSources, setFailedSources] = useState<string[]>([])
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const thumbnail = media.thumbnail
    ? `data:${media.thumbnail.mimeType};base64,${media.thumbnail.base64}`
    : null
  const preview = thumbnail && !failedSources.includes(thumbnail) ? thumbnail : null
  const fullSource = loadFullMedia && url && !failedSources.includes(url) ? url : null
  const ready = !!fullSource && loadedSource === fullSource
  const error = !!loadFullMedia && (state === 'error' || (!!url && failedSources.includes(url)))
  const loading = !!loadFullMedia && visual && !disabled && !ready && !error
  const Icon = media.kind === 'audio' ? Headphones : media.kind === 'video' ? Video : Images
  const label =
    media.kind === 'audio' ? 'Ouvir áudio' : media.kind === 'video' ? 'Abrir vídeo' : 'Abrir imagem'
  return (
    <div ref={elementRef} data-slot="library-media-tile" className="relative aspect-square min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${media.fileName ?? entry.message.id}`}
        aria-busy={loading}
        onClick={(event) => onOpen(entry, event.currentTarget, ready ? blob : null)}
        className="group relative flex size-full min-w-0 items-center justify-center overflow-hidden rounded-sm bg-muted outline-offset-2 hover:ring-2 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        {preview ? (
          <img
            src={preview}
            alt=""
            className="size-full object-cover"
            onError={() => setFailedSources((failed) => [...failed, preview])}
          />
        ) : loading ? (
          <Skeleton
            aria-hidden="true"
            className="size-full rounded-none motion-reduce:animate-none"
          />
        ) : (
          <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
        )}
        {fullSource && media.kind === 'image' && (
          <img
            src={fullSource}
            alt=""
            className={cn('absolute inset-0 size-full object-cover', !ready && 'opacity-0')}
            onLoad={() => setLoadedSource(fullSource)}
            onError={() => setFailedSources((failed) => [...failed, fullSource])}
          />
        )}
        {fullSource && media.kind === 'video' && (
          <video
            src={fullSource}
            muted
            playsInline
            preload="auto"
            tabIndex={-1}
            className={cn(
              'pointer-events-none absolute inset-0 size-full object-cover',
              !ready && 'opacity-0',
            )}
            onLoadedData={() => setLoadedSource(fullSource)}
            onError={() => setFailedSources((failed) => [...failed, fullSource])}
          >
            <track kind="captions" />
          </video>
        )}
        {loading && (
          <span
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="rounded-full bg-black/60 p-2 text-white">
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            </span>
            <span className="sr-only">Carregando mídia…</span>
          </span>
        )}
        {(showSender || media.kind === 'audio' || media.kind === 'video') && (
          <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1.5 py-1 text-left text-xs text-white">
            {(media.kind === 'audio' || media.kind === 'video') && (
              <span className="flex items-center gap-1 tabular-nums">
                <Icon aria-hidden="true" className="size-3.5" />
                {media.duration === null ? '' : formatTime(media.duration)}
              </span>
            )}
            {showSender && (
              <span className="block truncate font-medium">{entry.conversation.displayName}</span>
            )}
          </span>
        )}
      </button>
      {error && (
        <>
          <span role="alert" className="sr-only">
            Não foi possível carregar a mídia. {preview ? 'A miniatura continua disponível.' : ''}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="Tentar carregar mídia novamente"
            className="absolute top-1 right-1 size-8 bg-background/90"
            onClick={() => {
              setFailedSources([])
              setLoadedSource(null)
              retry()
            }}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </Button>
        </>
      )}
    </div>
  )
}
