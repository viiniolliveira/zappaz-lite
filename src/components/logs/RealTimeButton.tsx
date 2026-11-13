'use client'

import { useAtom } from 'jotai'
import { ScanEye } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { sessionIdAtom, webhookIdAtom } from '@/atoms/realtime-logs'
import { Button } from '@/components/ui/button'

interface RealTimeButtonProps {
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

interface LogsFilterValues {
  sessionId?: string
  webhookId?: string
  page: number
  pageSize: number
}

export function RealTimeButton({ setOpen }: RealTimeButtonProps) {
  const { control } = useFormContext<LogsFilterValues>()
  const [sessionId, webhookId] = useWatch({
    control,
    name: ['sessionId', 'webhookId'],
  })
  const [, setSessionIdState] = useAtom(sessionIdAtom)
  const [, setWebhookIdState] = useAtom(webhookIdAtom)

  function handleRealTimeClick() {
    setSessionIdState(sessionId ?? null)
    setWebhookIdState(webhookId ?? null)
    setOpen((prev) => !prev)
  }

  const isRealtimeDisabled = !sessionId || !webhookId

  return (
    <Button
      type="button"
      aria-label="Ver logs em tempo real"
      variant="outline"
      size="icon"
      className="mb-0"
      onClick={handleRealTimeClick}
      title="Logs Em Tempo Real"
      disabled={isRealtimeDisabled}
    >
      <ScanEye className="h-4 w-4" />
    </Button>
  )
}
