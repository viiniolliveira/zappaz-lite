'use client'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const items = Array.from({ length: 6 }).map((_, i, a) => `card-sekleton-${a.length - i}`)

export default function SessionSkeletonCards() {
  return (
    <div role="status" className="flex w-full flex-col gap-6">
      <span className="sr-only">Carregando sessões</span>
      <Skeleton className="h-8 w-28" />
      <div
        aria-hidden="true"
        className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {items.map((key) => (
          <Card
            key={key}
            className="bg-background min-w-0 w-full h-44 flex flex-col border rounded-lg justify-between py-4 px-4"
          >
            <div className="w-full h-12 flex items-start gap-2">
              <div className="w-full h-12 flex items-center gap-2">
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-37.5" />
                  <Skeleton className="h-4 w-25" />
                </div>
              </div>
              <Skeleton className="h-5 w-5 rounded-full" />
            </div>
            <div className="h-8 w-full flex gap-2">
              <Skeleton className="h-full w-32" />
              <Skeleton className="h-full w-12" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
