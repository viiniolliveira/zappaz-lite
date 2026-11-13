import { ExternalLink, Users } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MessageDTO } from '@/lib/chat/schemas'
import MessageText from './message-text'

export default function MessageGroupInvite({ message }: { message: MessageDTO }) {
  const [failedImage, setFailedImage] = useState(false)
  const invite = message.groupInvite
  if (!invite) return null
  const expired = !!invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()
  return (
    <section
      data-slot="message-group-invite"
      aria-label="Convite para grupo"
      className="w-72 max-w-full space-y-3 text-sm"
    >
      <div className="flex items-center gap-3">
        {invite.thumbnail && !failedImage ? (
          <img
            src={`data:image/jpeg;base64,${invite.thumbnail.base64}`}
            alt="Imagem do grupo"
            className="size-12 rounded-full object-cover"
            onError={() => setFailedImage(true)}
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <p className="break-words font-semibold">{invite.name}</p>
          <p className="text-xs text-muted-foreground">Convite para grupo do WhatsApp</p>
        </div>
      </div>
      {message.text && <MessageText text={message.text} />}
      {invite.url && !expired ? (
        <Button asChild variant="outline" className="w-full">
          <a href={invite.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" aria-hidden="true" />
            Ver convite no WhatsApp
          </a>
        </Button>
      ) : (
        <p className="border-t border-foreground/10 pt-2 text-xs text-muted-foreground">
          {expired ? 'Convite expirado' : 'Abra o WhatsApp para consultar este convite.'}
        </p>
      )}
    </section>
  )
}
