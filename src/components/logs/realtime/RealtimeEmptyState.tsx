import { Webhook } from 'lucide-react'

export function RealtimeEmptyState() {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl ">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <div className="absolute h-20 w-20 rounded-full border border-primary/30 animate-ping" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-[0_0_40px_rgba(255,255,255,0.08)]">
            <Webhook className="h-8 w-8 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Aguardando evento</h3>
          <p className="max-w-sm text-xs text-muted-foreground">
            Assim que um webhook receber um novo evento, o log será exibido aqui em tempo real.
          </p>
        </div>
      </div>
    </div>
  )
}
