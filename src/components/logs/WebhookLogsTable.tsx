'use client'

import { useAtomValue } from 'jotai'
import { Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { logRevisionAtom } from '@/atoms/log-updates'
import { getWebhookLogsAtom } from '@/atoms/webhook'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { WebhookLog } from '@/services/types'
import LogsDetail from './LogsDetail'
import SkeletonsLogs from './SkeletonsLogs'
import TableLogsContent from './TableLogsContent'
import { TablePagination } from './TablePagination'

interface LogsFilterValues {
  sessionId?: string
  webhookId?: string
  page: number
  pageSize: number
}

export default function WebhookLogsTable() {
  const { control, setValue } = useFormContext<LogsFilterValues>()
  const [sessionId, webhookId, watchedPage, watchedPageSize] = useWatch({
    control,
    name: ['sessionId', 'webhookId', 'page', 'pageSize'],
  })
  const page = watchedPage || 1
  const pageSize = watchedPageSize || 25
  const scope = `${sessionId ?? ''}:${webhookId ?? ''}`
  const revision = useAtomValue(logRevisionAtom(scope))
  const [seen, setSeen] = useState({ scope, revision })
  useEffect(() => {
    if (page === 1 || seen.scope !== scope) setSeen({ scope, revision })
  }, [page, scope, revision, seen.scope])
  const hasUpdates = page > 1 && seen.scope === scope && revision > seen.revision

  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const logsQueryAtom = getWebhookLogsAtom({
    sessionId: sessionId ?? '',
    webhookId: webhookId ?? '',
    page,
    pageSize,
  })

  const { data: response, isPending, isFetching, isError } = useAtomValue(logsQueryAtom)

  const logs = Array.isArray(response?.data) ? response.data : []
  const parsedPage = Number(response?.page)
  const parsedPageSize = Number(response?.pageSize)
  const parsedTotal = Number(response?.total)
  const rawPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : page
  const rawPageSize =
    Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : pageSize
  const total = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : 0
  const totalPages = rawPageSize > 0 ? Math.ceil(total / rawPageSize) : 1

  const handleOpenDrawer = (log: WebhookLog) => {
    setSelectedLog(log)
    setDrawerOpen(true)
  }

  if (!sessionId || !webhookId) {
    return (
      <EmptyState
        icon={Webhook}
        title="Acompanhe os eventos dos seus webhooks"
        description="Selecione uma sessão e um webhook nos filtros acima para consultar eventos, respostas e detalhes de cada envio."
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {hasUpdates && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Novos logs disponíveis</span>
          <Button variant="outline" size="sm" onClick={() => setValue('page', 1)}>
            Atualizar e voltar à primeira página
          </Button>
        </div>
      )}
      <div className="border rounded-lg bg-background">
        <Table aria-busy={isPending || isFetching}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Status</TableHead>
              <TableHead>Webhook</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Visualizar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              <SkeletonsLogs />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Não foi possível carregar os logs deste webhook.
                </TableCell>
              </TableRow>
            ) : (
              <TableLogsContent logs={logs} onViewDetails={handleOpenDrawer} />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        {logs.length > 0 && (
          <TablePagination
            page={rawPage}
            pageSize={rawPageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={(nextPage) => setValue('page', nextPage)}
            onPageSizeChange={(nextPageSize) => setValue('pageSize', nextPageSize)}
          />
        )}
      </div>

      <LogsDetail log={selectedLog} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  )
}
