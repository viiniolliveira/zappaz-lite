'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import * as z from 'zod'
import { RefreshButton } from '@/components/logs/RefreshButton'
import SelectSessionLogs from '@/components/logs/SelectSessionLogs'
import SelectWebhookLogs from '@/components/logs/SelectWebhook'
import WebhookLogsTable from '@/components/logs/WebhookLogsTable'
import { RealTimeButton } from './RealTimeButton'
import RealTimeLogs from './realtime/RealTimeLogs'

const logsFilterSchema = z.object({
  sessionId: z.string().optional(),
  webhookId: z.string().optional(),
  page: z.number(),
  pageSize: z.number(),
})

type LogsFilterValues = z.infer<typeof logsFilterSchema>

export default function LogsPage() {
  const [open, setOpen] = useState(false)

  const methods = useForm<LogsFilterValues>({
    resolver: zodResolver(logsFilterSchema),
    defaultValues: {
      sessionId: '',
      webhookId: '',
      page: 1,
      pageSize: 25,
    },
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={(e) => e.preventDefault()} className="w-full h-full">
        <div className="flex flex-col gap-6 items-start justify-center h-full w-full max-w-5xl">
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <div className="w-full flex gap-4 justify-end">
            <div className="flex w-full flex-wrap items-end gap-3 [&>[data-slot=form-item]]:min-w-0 [&>[data-slot=form-item]]:basis-full sm:w-auto sm:[&>[data-slot=form-item]]:basis-auto">
              <SelectSessionLogs />
              <SelectWebhookLogs />
              <RealTimeButton setOpen={setOpen} />
              <RefreshButton />
            </div>
          </div>
          <div className="w-full">
            <WebhookLogsTable />
          </div>
        </div>
        {open && <RealTimeLogs open={open} onOpenChange={setOpen} />}
      </form>
    </FormProvider>
  )
}
