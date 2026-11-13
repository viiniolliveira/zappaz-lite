import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingSession() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
