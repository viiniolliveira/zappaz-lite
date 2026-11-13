'use client'

import { useAtomValue } from 'jotai'
import { useFormContext } from 'react-hook-form'
import { sessionsAtom } from '@/atoms/session'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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

interface LogsFilterValues {
  sessionId?: string
  webhookId?: string
  page: number
  pageSize: number
}

export default function SelectSessionLogs() {
  const { data: response } = useAtomValue(sessionsAtom)
  const sessions = response?.data ?? []
  const { control, setValue } = useFormContext<LogsFilterValues>()

  return (
    <FormField
      control={control}
      name="sessionId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Sessão</FormLabel>
          <Select
            onValueChange={(val) => {
              field.onChange(val)
              // Reset webhook selected and set page to 1 when changing session
              setValue('webhookId', '')
              setValue('page', 1)
            }}
            value={field.value || ''}
          >
            <FormControl>
              <SelectTrigger className="w-full sm:w-55 ps-2 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_img]:shrink-0">
                <SelectValue placeholder="Selecione uma sessão" />
              </SelectTrigger>
            </FormControl>
            <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:inset-s-auto [&_*[role=option]>span]:inset-e-2 [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2">
              <SelectGroup>
                <SelectLabel className="ps-2">Sessões</SelectLabel>
                {sessions
                  .filter((session) => session.enabled)
                  .map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      <Avatar className="shrink-0 size-5">
                        {session.status === 'open' && session.profilePictureUrl && (
                          <AvatarImage src={session.profilePictureUrl} alt={session.displayName} />
                        )}
                        <AvatarFallback>{session.displayName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-24 min-w-24">{session.displayName}</span>
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  )
}
