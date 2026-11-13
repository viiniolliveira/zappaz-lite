import { useAtomValue } from 'jotai'
import { ChevronRight, Images } from 'lucide-react'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import { chatContactLibrarySummaryAtom } from '@/atoms/chat-contact-details'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { LibraryEntry } from '@/lib/chat/schemas'
import LibraryMediaTile from './library-media-tile'

export default function ContactLibrarySummary({
  onOpen,
  onOpenMedia,
}: {
  onOpen: () => void
  onOpenMedia: (entry: LibraryEntry, trigger: HTMLButtonElement, blob: Blob | null) => void
}) {
  const summary = useAtomValue(chatContactLibrarySummaryAtom)
  const denied = useAtomValue(chatAccessDeniedAtom)
  return (
    <section aria-label="Mídia, links e documentos" className="space-y-4 border-t px-5 py-6">
      <button
        type="button"
        disabled={denied}
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-sm text-left text-sm font-medium outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
      >
        <Images aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">Mídia, links e documentos</span>
        {summary.data && (
          <span className="text-xs tabular-nums text-muted-foreground">{summary.data.count}</span>
        )}
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {summary.isPending ? (
        <div role="status" aria-busy="true" className="grid grid-cols-4 gap-2">
          <span className="sr-only">Carregando mídias…</span>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton
              key={index}
              aria-hidden="true"
              className="aspect-square w-full motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : summary.data?.entries.length ? (
        <div className="grid grid-cols-4 gap-2">
          {summary.data.entries.map((entry) => (
            <LibraryMediaTile
              key={entry.message.id}
              entry={entry}
              disabled={denied}
              onOpen={onOpenMedia}
            />
          ))}
        </div>
      ) : (
        !summary.isError && (
          <p className="text-xs text-muted-foreground">Nenhuma mídia compartilhada.</p>
        )
      )}
      {summary.isError && (
        <div role="alert" className="space-y-2 text-xs text-muted-foreground">
          <p>Não foi possível carregar as mídias.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={denied}
            onClick={() => {
              void summary.refetch()
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </section>
  )
}
