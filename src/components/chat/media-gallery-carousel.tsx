import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
import { type ChatMediaMessage, mediaThumbnail } from '@/lib/chat/media-library'

// Adapted from the CLI-installed @reui/c-carousel-8 composition.
export default function MediaGalleryCarousel({
  messages,
  selectedId,
  onSelect,
  children,
}: {
  messages: ChatMediaMessage[]
  selectedId: string
  onSelect: (id: string) => void
  children: ReactNode
}) {
  const [api, setApi] = useState<CarouselApi>()
  const syncingSelection = useRef(false)
  const [opts] = useState(() => ({
    startIndex: messages.findIndex((message) => message.id === selectedId),
    duration: 20,
    watchDrag: (instance: NonNullable<CarouselApi>, event: MouseEvent | TouchEvent) => {
      void instance
      return !(
        event.target instanceof Element &&
        event.target.closest(
          'video, audio, iframe, button, a, [data-slot=video-player-pro], [data-slot=message-audio]',
        )
      )
    },
  }))
  const reportSelection = useEffectEvent(() => {
    if (syncingSelection.current) return
    const message = messages[api?.selectedScrollSnap() ?? 0]
    if (message) onSelect(message.id)
  })
  const restoreSelection = useEffectEvent(() => {
    const index = messages.findIndex((message) => message.id === selectedId)
    if (index < 0 || !api) return
    syncingSelection.current = true
    api.scrollTo(index, true)
    syncingSelection.current = false
  })
  useEffect(() => {
    if (!api) return
    const onChange = () => reportSelection()
    const onReInit = () => restoreSelection()
    api.on('select', onChange)
    api.on('reInit', onReInit)
    return () => {
      api.off('select', onChange)
      api.off('reInit', onReInit)
    }
  }, [api])
  useEffect(() => {
    const index = messages.findIndex((message) => message.id === selectedId)
    if (index < 0 || !api) return
    // Before Embla reinitializes after a prepend, its old snaps can clamp this index.
    // Synchronizing the view must not replace the message selected by the user.
    syncingSelection.current = true
    api.scrollTo(index, true)
    syncingSelection.current = false
  }, [api, messages, selectedId])

  return (
    <Carousel
      setApi={setApi}
      opts={opts}
      aria-label="Mídia ampliada"
      className="min-h-0 flex-1 [&>[data-slot=carousel-content]]:h-full"
    >
      <CarouselContent className="ml-0 h-full">
        {messages.map((message) => (
          <CarouselItem
            key={message.id}
            aria-hidden={message.id !== selectedId}
            className="flex h-full items-center justify-center pl-0"
          >
            {message.id === selectedId ? (
              children
            ) : mediaThumbnail(message) ? (
              <img
                src={mediaThumbnail(message)}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {message.media.fileName ?? 'Arquivo'}
              </span>
            )}
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious
        aria-label="Mídia anterior"
        className="left-2 z-10 size-10 bg-background/90 md:left-5"
      />
      <CarouselNext
        aria-label="Próxima mídia"
        className="right-2 z-10 size-10 bg-background/90 md:right-5"
      />
    </Carousel>
  )
}
