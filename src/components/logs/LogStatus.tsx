import { Badge } from '@/components/ui/badge'

export default function LogStatus({ status = 0 }: { status?: number }) {
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      {status >= 500 ? (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full bg-red-500"
          aria-hidden="true"
        />
      ) : status >= 400 ? (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full bg-orange-500"
          aria-hidden="true"
        />
      ) : status >= 300 ? (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full bg-yellow-500"
          aria-hidden="true"
        />
      ) : status >= 200 ? (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
      ) : (
        <span
          className="inline-block size-1.5 shrink-0 rounded-full bg-gray-400"
          aria-hidden="true"
        />
      )}
      {status || 'Sem resposta'}
    </Badge>
  )
}
