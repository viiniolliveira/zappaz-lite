import { Maximize2, Minimize2, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface YouTubePlayerProps {
  videoId: string
  title?: string
  defaultExpanded?: boolean
  customThumbnail?: string
  className?: string
  containerClassName?: string
  expandedClassName?: string
  thumbnailClassName?: string
  thumbnailImageClassName?: string
  playButtonClassName?: string
  playIconClassName?: string
  titleClassName?: string
  controlsClassName?: string
  expandButtonClassName?: string
  backdropClassName?: string
  playerClassName?: string
}

// Cult UI player adapted for chat: native dialog avoids shared-layout animation
// conflicts and escapes the history's clipping/stacking contexts.
export function YouTubePlayer({
  videoId,
  title = 'Vídeo do YouTube',
  defaultExpanded = false,
  customThumbnail,
  className,
  containerClassName,
  expandedClassName,
  thumbnailClassName,
  thumbnailImageClassName,
  playButtonClassName,
  playIconClassName,
  controlsClassName,
  expandButtonClassName,
  backdropClassName,
  playerClassName,
}: YouTubePlayerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [playing, setPlaying] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (expanded && !dialog.open) dialog.showModal()
    if (!expanded && dialog.open) dialog.close()
  }, [expanded])

  const surface = (inDialog: boolean) => (
    <div className={cn('relative aspect-video overflow-hidden bg-black', playerClassName)}>
      {playing && (inDialog || !expanded) ? (
        <iframe
          src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&controls=1`}
          title={title}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <div className={cn('absolute inset-0', thumbnailClassName)}>
          <img
            src={customThumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt={title}
            loading="lazy"
            className={cn('size-full object-cover', thumbnailImageClassName)}
          />
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Reproduzir vídeo do YouTube"
            className={cn(
              'absolute inset-0 grid size-full cursor-pointer place-items-center bg-transparent focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white',
              playButtonClassName,
            )}
          >
            <span className="grid size-20 place-items-center rounded-full bg-black/35 transition-colors hover:bg-black/50">
              <Play
                aria-hidden="true"
                className={cn(
                  'size-12 translate-x-0.5 fill-white text-white stroke-1',
                  playIconClassName,
                )}
              />
            </span>
          </button>
        </div>
      )}
      <YouTubePlayerControls
        expanded={inDialog}
        onToggleExpand={() => setExpanded((value) => !value)}
        controlsClassName={controlsClassName}
        expandButtonClassName={expandButtonClassName}
      />
    </div>
  )

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className={cn('overflow-hidden rounded-t-xl', containerClassName)}>{surface(false)}</div>
      <dialog
        ref={dialogRef}
        aria-label={`${title} expandido`}
        onCancel={() => setExpanded(false)}
        onClose={() => {
          setExpanded(false)
          containerRef.current
            ?.querySelector<HTMLButtonElement>('[aria-label="Expandir vídeo"]')
            ?.focus()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setExpanded(false)
        }}
        className={cn(
          'fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,1200px,160dvh)] max-w-none overflow-visible rounded-xl border-0 bg-transparent p-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-sm',
          backdropClassName,
          expandedClassName,
        )}
      >
        {expanded && <div className="overflow-hidden rounded-xl">{surface(true)}</div>}
      </dialog>
    </div>
  )
}

interface YouTubePlayerControlsProps {
  videoId?: string
  expanded: boolean
  playing?: boolean
  isHovered?: boolean
  onToggleExpand: () => void
  controlsClassName?: string
  expandButtonClassName?: string
}

export function YouTubePlayerControls({
  expanded,
  onToggleExpand,
  controlsClassName,
  expandButtonClassName,
}: YouTubePlayerControlsProps) {
  return (
    <div className={cn('absolute right-2 top-2 z-10', controlsClassName)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleExpand}
        aria-label={expanded ? 'Minimizar vídeo' : 'Expandir vídeo'}
        className={cn(
          'size-8 rounded-full bg-black/45 text-white hover:bg-black/65 hover:text-white',
          expandButtonClassName,
        )}
      >
        {expanded ? (
          <Minimize2 aria-hidden="true" className="size-4" />
        ) : (
          <Maximize2 aria-hidden="true" className="size-4" />
        )}
      </Button>
    </div>
  )
}
