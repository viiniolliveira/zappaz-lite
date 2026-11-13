'use client'

import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { webhookKeys } from '@/atoms/webhook'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LogsFilterValues {
  sessionId?: string
  webhookId?: string
  page: number
  pageSize: number
}

export function RefreshButton() {
  const queryClient = useQueryClient()
  const { control } = useFormContext<LogsFilterValues>()
  const [sessionId, webhookId] = useWatch({
    control,
    name: ['sessionId', 'webhookId'],
  })

  // Check if the specific logs query is currently fetching
  const isFetching = useIsFetching({
    queryKey: sessionId && webhookId ? webhookKeys.logs(sessionId, webhookId) : [],
  })

  const handleRefresh = () => {
    if (sessionId && webhookId) {
      queryClient.invalidateQueries({
        queryKey: webhookKeys.logs(sessionId, webhookId),
      })
    }
  }

  return (
    <Button
      type="button"
      aria-label={isFetching > 0 ? 'Atualizando logs' : 'Atualizar logs'}
      variant="outline"
      size="icon"
      className="mb-0" // Aligns with the Select elements inside FormItems
      onClick={handleRefresh}
      disabled={!sessionId || !webhookId || isFetching > 0}
      title="Atualizar"
    >
      <RotateCw className={cn('h-4 w-4', isFetching > 0 && 'animate-spin')} />
    </Button>
  )
}
