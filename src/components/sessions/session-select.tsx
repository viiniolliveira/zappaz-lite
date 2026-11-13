import { useAtomValue } from 'jotai'
import type { ComponentProps, ReactNode } from 'react'
import { sessionsAtom } from '@/atoms/session'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { SessionSchema } from '@/services/types'

type SessionSelectProps = Omit<ComponentProps<typeof SelectTrigger>, 'value' | 'children'> & {
  value: string
  onValueChange: (value: string) => void
  children?: ReactNode
  selectedConnected?: boolean
}

function SessionLabel({ session, connected }: { session: SessionSchema; connected: boolean }) {
  return (
    <>
      <Avatar className="size-5 shrink-0">
        {connected && session.profilePictureUrl && (
          <AvatarImage src={session.profilePictureUrl} alt="" />
        )}
        <AvatarFallback>{session.displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 max-w-40 truncate">{session.displayName}</span>
      <span
        role="img"
        aria-label={connected ? 'Conectada' : 'Desconectada'}
        className={cn('size-2.5 shrink-0 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')}
      />
    </>
  )
}

export default function SessionSelect({
  value,
  onValueChange,
  children,
  className,
  selectedConnected,
  ...triggerProps
}: SessionSelectProps) {
  const { data: response } = useAtomValue(sessionsAtom)
  const sessions = response?.data ?? []
  const selected = sessions.find((session) => session.enabled && session.id === value)
  const connected = selected && (selectedConnected ?? selected.status === 'open')
  const triggerLabel = triggerProps['aria-label']
  return (
    <Select value={value} onValueChange={onValueChange} disabled={triggerProps.disabled}>
      <SelectTrigger
        {...triggerProps}
        aria-label={
          selected && triggerLabel
            ? `${triggerLabel}: ${selected.displayName}, ${connected ? 'conectada' : 'desconectada'}`
            : triggerLabel
        }
        className={cn(
          'w-55 ps-2 [&>span]:flex [&>span]:items-center [&>span]:gap-2 [&>span_img]:shrink-0',
          className,
        )}
      >
        <SelectValue placeholder="Selecione uma sessão">
          {selected ? <SessionLabel session={selected} connected={!!connected} /> : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:inset-s-auto [&_*[role=option]>span]:inset-e-2 [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2">
        {children}
        <SelectGroup>
          <SelectLabel className="ps-2">Sessões</SelectLabel>
          {sessions
            .filter((session) => session.enabled)
            .map((session) => (
              <SelectItem key={session.id} value={session.id}>
                <SessionLabel
                  session={session}
                  connected={
                    session.id === value
                      ? (selectedConnected ?? session.status === 'open')
                      : session.status === 'open'
                  }
                />
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
