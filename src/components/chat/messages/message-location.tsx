import { ArrowUpRight, MapPin } from 'lucide-react'
import { useState } from 'react'
import type { MessageDTO } from '@/lib/chat/schemas'

export default function MessageLocation({ location }: { location: MessageDTO['location'] }) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)
  if (!location)
    return <p className="p-2 text-sm text-muted-foreground">Localização indisponível</p>
  const { latitude, longitude, name, address, thumbnail } = location
  const hasCoordinates =
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  const query = hasCoordinates
    ? `${latitude},${longitude}`
    : [name, address].filter((value) => value?.trim()).join(', ')
  let url = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null
  if (!url && location.url) {
    try {
      const provided = new URL(
        location.url.startsWith('www.') ? `https://${location.url}` : location.url,
      )
      if (
        (provided.protocol === 'https:' || provided.protocol === 'http:') &&
        !provided.username &&
        !provided.password
      )
        url = provided.href
    } catch {
      // Invalid WhatsApp URLs must never become clickable links.
    }
  }
  if (!url) {
    return <p className="p-2 text-sm text-muted-foreground">Localização indisponível</p>
  }
  const image = thumbnail ? `data:${thumbnail.mimeType};base64,${thumbnail.base64}` : null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${name || 'localização'}${query ? ' no Google Maps' : ''}`}
      data-slot="message-location"
      className="group/location block w-[min(26rem,70vw)] max-w-full overflow-hidden rounded-lg bg-black/5 text-foreground transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-black/15 dark:hover:bg-black/25"
    >
      {image && image !== failedThumbnail ? (
        <img
          src={image}
          alt="Miniatura do mapa enviada pelo WhatsApp"
          width={thumbnail?.width ?? undefined}
          height={thumbnail?.height ?? undefined}
          className="aspect-video w-full object-cover"
          loading="lazy"
          onError={() => setFailedThumbnail(image)}
        />
      ) : null}
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPin aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug font-semibold [overflow-wrap:anywhere]">
            {name || 'Localização compartilhada'}
          </p>
          {address && (
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground/65 [overflow-wrap:anywhere]">
              {address}
            </p>
          )}
          <span className="mt-2 flex items-center gap-1 text-xs text-foreground/65 group-hover/location:underline">
            {query ? 'Ver no Google Maps' : 'Abrir localização'}
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </span>
        </div>
      </div>
    </a>
  )
}
