import { Copy, QrCode } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { MessageDTO } from '@/lib/chat/schemas'

export default function MessagePayment({
  payment,
  children,
  footer,
  metadata,
  actions,
  disabled = false,
}: {
  payment: NonNullable<NonNullable<MessageDTO['interactive']>['payment']>
  children: ReactNode
  footer?: string | null
  metadata?: ReactNode
  actions?: ReactNode
  disabled?: boolean
}) {
  const [copying, setCopying] = useState(false)
  const total = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: payment.currency,
  }).format(payment.totalAmount.value / payment.totalAmount.offset)

  async function copyPixCode() {
    if (copying) return
    setCopying(true)
    try {
      await navigator.clipboard.writeText(payment.pixCode)
      toast.success('Código Pix copiado')
    } catch {
      toast.error('Não foi possível copiar o código Pix. Tente novamente.')
    } finally {
      setCopying(false)
    }
  }

  return (
    <div
      data-slot="message-payment"
      className="w-72 max-w-full overflow-hidden rounded-lg bg-foreground/5 text-sm [overflow-wrap:anywhere]"
    >
      <div className="mx-3 border-b border-dashed border-foreground/15 py-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Nº da cobrança: {payment.referenceId}
        </p>
      </div>
      <ul className="mx-3 space-y-3 border-b border-dashed border-foreground/15 py-3">
        {payment.items.map((item) => (
          <li key={`${item.name}-${item.quantity}`}>
            <p className="font-semibold">{item.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Quantidade: {item.quantity}</p>
          </li>
        ))}
      </ul>
      <div className="mx-3 flex items-center justify-between gap-3 border-b border-dashed border-foreground/15 py-3">
        <span className="font-medium">Pagar com</span>
        <span className="flex shrink-0 items-center gap-1.5 text-primary">
          <QrCode className="size-5" aria-hidden="true" />
          <span className="text-xs font-semibold">Pix</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <span>Total</span>
        <span className="text-right font-semibold tabular-nums">{total}</span>
      </div>
      <div className="space-y-1.5 bg-foreground/5 px-2.5 pt-2.5 pb-1.5">
        {children}
        {footer && (
          <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{footer}</p>
        )}
        {metadata}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-11 w-full whitespace-normal rounded-none border-t border-foreground/10 text-primary"
        disabled={disabled || copying}
        aria-busy={copying}
        onClick={() => void copyPixCode()}
      >
        <Copy className="size-4 shrink-0" aria-hidden="true" />
        Copiar código Pix
      </Button>
      {actions}
    </div>
  )
}
