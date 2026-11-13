'use client'

import { Eye, FileSearch } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { WebhookLog } from '@/services/types'
import LogStatus from './LogStatus'

interface TableLogsContentProps {
  logs: WebhookLog[]
  onViewDetails: (log: WebhookLog) => void
}

export default function TableLogsContent({ logs, onViewDetails }: TableLogsContentProps) {
  if (!logs || logs.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={5} className="p-0 whitespace-normal">
          <EmptyState
            icon={FileSearch}
            title="Nenhum log por aqui ainda"
            description="Nenhum log encontrado para os filtros selecionados. Os registros aparecerão aqui quando houver eventos para este webhook."
            className="rounded-none border-0"
          />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {logs.map((item) => (
        <TableRow key={item.id}>
          <TableCell className="font-medium">
            <LogStatus status={item?.response?.status} />
          </TableCell>
          <TableCell>{item.webhookDisplayName}</TableCell>
          <TableCell>{item.event}</TableCell>
          <TableCell>
            {item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : ''}
          </TableCell>
          <TableCell className="text-end">
            <Button onClick={() => onViewDetails(item)} variant="outline">
              <Eye />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
