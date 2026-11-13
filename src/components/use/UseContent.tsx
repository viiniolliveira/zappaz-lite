'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import * as z from 'zod'
import SelectDateFilter from '@/components/use/SelectDateFilter'
import SelectSessionUse from '@/components/use/SelectSessionUse'
import { UseChart } from '@/components/use/useChart'

const useFilterSchema = z.object({
  sessionId: z.string().optional(),
  dateFilter: z.string().optional(),
})

type UseFilterValues = z.infer<typeof useFilterSchema>

export default function UseContent() {
  const methods = useForm<UseFilterValues>({
    resolver: zodResolver(useFilterSchema),
    defaultValues: {
      sessionId: '',
      dateFilter: 'ultimos-30-dias',
    },
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={(e) => e.preventDefault()} className="w-full h-full">
        <div className="flex flex-col gap-6 items-start justify-center h-full w-full max-w-5xl">
          <h1 className="text-2xl font-semibold tracking-tight">Uso</h1>
          <div className="w-full flex flex-wrap gap-4 items-end justify-end [&>div]:min-w-0 [&>div]:basis-full sm:[&>div]:basis-auto [&_button[role=combobox]]:w-full">
            <div>
              <SelectDateFilter />
            </div>
            <div>
              <SelectSessionUse />
            </div>
          </div>
          <div className="w-full">
            <UseChart />
          </div>
        </div>
      </form>
    </FormProvider>
  )
}
