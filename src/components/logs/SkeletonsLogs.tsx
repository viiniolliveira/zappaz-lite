'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

export default function SkeletonsLogs() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-15" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-37.5" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-25" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-30" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-8 w-8 inline-block" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
