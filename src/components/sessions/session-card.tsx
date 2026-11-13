'use client'

import { Settings } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BorderBeam } from '@/components/magicui/border-beam'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { SessionSchema } from '@/services/types'
import SessionCardButtons from './session-card-buttons'

export default function SessionCard({ session }: { session: SessionSchema }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)

  const handleClick = () => {
    navigate(`/sessions/${session.id}`)
  }

  return (
    <Card
      key={session.id}
      className={`
        bg-background
        min-w-0 w-full h-44 flex flex-col border rounded-lg justify-between py-4 px-4 relative
        dark:border-accent hover:bg-accent/70 dark:hover:bg-accent/10 overflow-hidden
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-full h-12 flex items-start gap-2">
        <div className="min-w-0 flex-1 h-12 flex items-center gap-2">
          <Avatar className="size-12 border">
            {session.status === 'open' && session.profilePictureUrl && (
              <AvatarImage src={session.profilePictureUrl} alt={session.displayName} />
            )}
            <AvatarFallback>{session.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <p className="truncate text-lg font-medium" title={session.displayName}>
              {session.displayName}
            </p>
            <p className="text-sm text-muted-foreground">
              {session.status === 'open' ? session.jid?.replace(/@.*$/, '') : '***********'}
            </p>
          </div>
        </div>

        <span
          role="img"
          aria-label={session.status === 'open' ? 'Conectada' : 'Desconectada'}
          className="flex shrink-0 justify-center text-center items-center h-5 w-5 relative"
        >
          <span
            className={`animate-ping z-0 h-3 w-3 rounded-full absolute inset-0 m-auto ${
              session.status === 'open' ? 'bg-green-400' : 'bg-red-400'
            } opacity-75`}
          ></span>
          <span
            className={`rounded-full z-5 h-3 w-3 absolute inset-0 m-auto ${
              session.status === 'open' ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
        </span>
      </div>
      <div className="h-8 w-full flex gap-2 relative z-10">
        <SessionCardButtons session={session} />
        <Button
          id={`config-session-btn-${session.id}`}
          aria-label={`Configurar ${session.displayName}`}
          size="icon"
          onClick={handleClick}
          variant={'outline'}
        >
          <Settings />
        </Button>
      </div>

      {hovered && (
        <BorderBeam
          duration={4}
          size={300}
          reverse
          className={`from-transparent ${
            !session.enabled ? 'via-red-500' : 'via-ring'
          } to-transparent`}
        />
      )}
    </Card>
  )
}
