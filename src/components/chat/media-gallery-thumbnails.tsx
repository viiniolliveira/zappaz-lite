import { FileText, Headphones, Video } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Carousel, type CarouselApi, CarouselContent, CarouselItem } from '@/components/ui/carousel'
import { type ChatMediaMessage, mediaThumbnail } from '@/lib/chat/media-library'
import { cn } from '@/lib/utils'

// Adapted from the CLI-installed @reui/c-carousel-4 responsive carousel.
export default function MediaGalleryThumbnails({
  messages,
  selectedId,
  onSelect,
}: {
  messages: ChatMediaMessage[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const [api, setApi] = useState<CarouselApi>()
  const opts = useMemo(
    () => ({ align: 'center' as const, containScroll: 'keepSnaps' as const, dragFree: true }),
    [],
  )
  useEffect(() => {
    if (!api) return
    const showSelected = () => {
      const index = messages.findIndex((message) => message.id === selectedId)
      if (index >= 0) api.scrollTo(index, true)
    }
    showSelected()
    api.on('reInit', showSelected)
    return () => {
      api.off('reInit', showSelected)
    }
  }, [api, messages, selectedId])
  return (
    <Carousel
      opts={opts}
      setApi={setApi}
      aria-label="Miniaturas da conversa"
      className="min-w-0 flex-1"
    >
      <CarouselContent className="ml-0 gap-2">
        {messages.map((message, index) => (
          <CarouselItem key={message.id} className="basis-16 pl-0 md:basis-20">
            <button
              type="button"
              aria-label={`Abrir ${message.type === 'image' ? 'imagem' : message.type === 'video' ? 'vídeo' : message.type === 'audio' ? 'áudio' : 'documento'} ${index + 1}`}
              aria-current={message.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(message.id)}
              className={cn(
                'relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border-2 bg-muted outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                message.id === selectedId
                  ? 'border-primary'
                  : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              {mediaThumbnail(message) ? (
                <img src={mediaThumbnail(message)} alt="" className="size-full object-cover" />
              ) : message.type === 'audio' ? (
                <Headphones aria-hidden="true" className="size-6 text-muted-foreground" />
              ) : (
                <FileText aria-hidden="true" className="size-6 text-muted-foreground" />
              )}
              {message.type === 'video' && (
                <Video
                  aria-hidden="true"
                  className="absolute bottom-1 left-1 size-4 rounded bg-black/60 p-0.5 text-white"
                />
              )}
            </button>
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  )
}
