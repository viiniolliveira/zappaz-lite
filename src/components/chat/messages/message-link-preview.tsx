import { Link2 } from 'lucide-react'
import { useState } from 'react'
import type { z } from 'zod'
import { linkPreviewSchema } from '@/lib/chat/schemas'

export default function MessageLinkPreview({
  preview,
}: {
  preview: z.infer<typeof linkPreviewSchema>
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const parsed = linkPreviewSchema.safeParse(preview)
  if (!parsed.success) return null
  const { url, title, description, thumbnail } = parsed.data
  const destination = new URL(url)
  if (destination.username || destination.password) return null
  const domain = destination.hostname
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir link: ${title || domain}`}
      className="group/link-preview block w-full min-w-0 overflow-hidden rounded-lg bg-black/5 text-foreground transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-black/15 dark:hover:bg-black/25"
      data-slot="message-link-preview"
    >
      {thumbnail && !imageFailed && (
        <img
          src={`data:${thumbnail.mimeType};base64,${thumbnail.base64}`}
          alt=""
          width={thumbnail.width ?? undefined}
          height={thumbnail.height ?? undefined}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="aspect-[8/5] w-full bg-black/5 object-cover"
        />
      )}
      <div className="px-3 py-3 sm:px-3.5">
        {title && (
          <p className="line-clamp-2 text-sm leading-snug font-semibold [overflow-wrap:anywhere]">
            {title}
          </p>
        )}
        {description && (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-foreground/65 [overflow-wrap:anywhere]">
            {description}
          </p>
        )}
        <div className="mt-3 flex min-w-0 items-center gap-2 text-sm text-foreground/80">
          <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate group-hover/link-preview:underline group-focus-visible/link-preview:underline">
            {domain}
          </span>
        </div>
      </div>
    </a>
  )
}
