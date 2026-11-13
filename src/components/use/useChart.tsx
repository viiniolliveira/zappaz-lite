'use client'

import { useAtomValue } from 'jotai'
import { ChartNoAxesCombined, MessageSquare } from 'lucide-react'
import { Suspense } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import { getSessionHistoryAtom } from '@/atoms/session'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { getDateRangeFromFilter } from '@/lib/utils/date-filter'

const chartConfig = {
  desktop: {
    label: 'Mensagens',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function Chart() {
  const { control } = useFormContext()
  const [sessionId, dateFilter = 'ultimos-30-dias'] = useWatch({
    control,
    name: ['sessionId', 'dateFilter'],
  })

  const { startDate, endDate, granularity } = getDateRangeFromFilter(dateFilter)

  // Se não tem sessão, não chamamos a query (o enabled do atom já lida com false se string vazia)
  const historyAtom = getSessionHistoryAtom({
    id: sessionId || '',
    granularity,
    startDate,
    endDate,
  })

  const { data: response, isPending, isError, refetch } = useAtomValue(historyAtom)

  if (!sessionId) {
    return (
      <EmptyState
        icon={ChartNoAxesCombined}
        title="Descubra o ritmo das suas mensagens"
        description="Selecione uma sessão acima para acompanhar o volume de mensagens enviadas e sua evolução no período escolhido."
      />
    )
  }

  if (isPending) return <Skeleton className="h-72 w-full rounded-lg sm:h-96" />

  if (isError) {
    return (
      <Card role="alert">
        <CardHeader>
          <CardTitle>Não foi possível carregar o uso</CardTitle>
          <CardDescription>
            Tente carregar novamente para consultar as mensagens desta sessão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  const total = response?.total || 0
  const rawData = response?.data || {}

  return (
    <Card className="bg-background">
      <CardHeader>
        <CardTitle>Total de mensagens: {total.toLocaleString('pt-BR')}</CardTitle>
        <CardDescription>Mostrando o total de mensagens enviadas por período</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma mensagem neste período"
            description="Não há mensagens enviadas no intervalo selecionado. Experimente outro período ou selecione uma sessão diferente nos filtros acima."
            className="min-h-64 border-0 sm:min-h-72"
          />
        ) : (
          <ChartContainer config={chartConfig} className="h-72 w-full sm:h-96">
            <AreaChart
              accessibilityLayer
              data={Object.entries(rawData)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([date, messages]) => ({
                  date,
                  desktop: messages.length,
                }))}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                }
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
                labelFormatter={(label) =>
                  new Date(label as string).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                }
              />
              <Area
                dataKey="desktop"
                type="natural"
                fill={chartConfig.desktop.color}
                fillOpacity={0.2}
                stroke={chartConfig.desktop.color}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export const UseChart = () => {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg sm:h-96" />}>
      <Chart />
    </Suspense>
  )
}
