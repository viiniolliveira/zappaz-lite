import { Skeleton } from '@/components/ui/skeleton'

export default function ConversationListSkeleton({
  loadingMore = false,
}: {
  loadingMore?: boolean
}) {
  return (
    <div
      role="status"
      aria-label={loadingMore ? 'Carregando mais conversas' : 'Carregando conversas'}
    >
      <span className="sr-only">
        {loadingMore ? 'Carregando mais conversas…' : 'Carregando conversas…'}
      </span>
      <ul aria-hidden="true" className="p-2">
        {(loadingMore
          ? ['first', 'second']
          : ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']
        ).map((id) => (
          <li key={id} className="flex items-center gap-3 rounded-lg px-3 py-4">
            <Skeleton className="size-11 shrink-0 rounded-full motion-reduce:animate-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2 pr-7">
                <Skeleton className="h-4 w-28 max-w-full motion-reduce:animate-none" />
                <Skeleton className="h-3 w-8 shrink-0 motion-reduce:animate-none" />
              </div>
              <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
