'use client'

import { useAtomValue } from 'jotai'
import { useFormContext, useWatch } from 'react-hook-form'
import { getWebhooksAtom } from '@/atoms/webhook'

import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Webhook } from '@/services/types'

function StatusDot({ className }: { className?: string }) {
  return (
    <svg
      width="8"
      height="8"
      fill="currentColor"
      viewBox="0 0 8 8"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="4" cy="4" r="4" />
    </svg>
  )
}

interface LogsFilterValues {
  sessionId?: string
  webhookId?: string
  page: number
  pageSize: number
}

export default function SelectWebhookLogs() {
  const { control, setValue } = useFormContext<LogsFilterValues>()
  const sessionId = useWatch({ control, name: 'sessionId' })

  // Fetch webhooks only if we have a selected sessionId
  const {
    data: response,
    isPending,
    isFetching,
    isError,
  } = useAtomValue(getWebhooksAtom(sessionId ?? ''))
  const webhooks = Array.isArray(response?.data) ? response.data : []
  const isLoading = isPending || isFetching

  return (
    <FormField
      control={control}
      name="webhookId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Webhook</FormLabel>
          <Select
            onValueChange={(val) => {
              field.onChange(val)
              setValue('page', 1) // Reset page on webhook change
            }}
            value={field.value || ''}
            disabled={!sessionId || isLoading || isError}
          >
            <FormControl>
              <SelectTrigger className="w-full sm:w-55 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_svg]:shrink-0">
                <SelectValue
                  placeholder={
                    !sessionId
                      ? 'Selecione uma sessão'
                      : isLoading
                        ? 'Carregando webhooks...'
                        : isError
                          ? 'Erro ao carregar webhooks'
                          : webhooks.length === 0
                            ? 'Nenhum Webhook'
                            : 'Selecione um Webhook'
                  }
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:inset-s-auto [&_*[role=option]>span]:inset-e-2 [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span>svg]:shrink-0">
              {webhooks.map((webhook: Webhook) => (
                <SelectItem key={webhook.id} value={webhook.id}>
                  <span className="flex items-center gap-2">
                    <StatusDot
                      className={
                        webhook.enabled ? 'text-emerald-600 size-3' : 'text-red-600 size-3'
                      }
                    />
                    <span className="truncate max-w-24 min-w-24">{webhook.displayName}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  )
}
