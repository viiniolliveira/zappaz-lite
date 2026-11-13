'use client'

import { useFormContext } from 'react-hook-form'
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function SelectDateFilter() {
  const { control } = useFormContext()

  return (
    <FormField
      control={control}
      name="dateFilter"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Data</FormLabel>
          <Select onValueChange={field.onChange} value={field.value || 'ultimos-30-dias'}>
            <FormControl>
              <SelectTrigger className="w-45">
                <SelectValue placeholder="Selecione um período" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Período</SelectLabel>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="ultimos-7-dias">Últimos 7 dias</SelectItem>
                <SelectItem value="ultimos-30-dias">Últimos 30 dias</SelectItem>
                <SelectItem value="mes-atual">Mês atual</SelectItem>
                <SelectItem value="ultimos-60-dias">Últimos 60 dias</SelectItem>
                <SelectItem value="ultimos-90-dias">Últimos 90 dias</SelectItem>
                <SelectItem value="ultimos-180-dias">Últimos 180 dias</SelectItem>
                <SelectItem value="ano-atual">Ano atual</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  )
}
