import { Camera, Video } from 'lucide-react'
import { useState } from 'react'
import type { ReplyDTO } from '@/lib/chat/schemas'
import { type ChatMessage, messagePreview } from '@/lib/chat/types'
import MessageFormattedText from './message-formatted-text'

export default function MessageReply({
  reply,
  quotedMessage,
  contactName,
  onNavigate,
}: {
  reply: ReplyDTO | null
  quotedMessage?: ChatMessage
  contactName?: string
  onNavigate?: (reply: ReplyDTO) => void
}) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null)
  if (!reply) return null
  const deleted = !!quotedMessage?.deletedAt
  const type = quotedMessage?.type ?? reply.type
  const visual = !deleted && (type === 'image' || type === 'video')
  const thumbnail = deleted ? null : (quotedMessage?.media?.thumbnail ?? reply.media?.thumbnail)
  const thumbnailUrl =
    visual && thumbnail ? `data:${thumbnail.mimeType};base64,${thumbnail.base64}` : null
  const fromMe = quotedMessage?.fromMe ?? reply.fromMe
  const author =
    fromMe === true
      ? 'Você'
      : (quotedMessage?.sender.name ?? (fromMe === false ? contactName : null) ?? 'Mensagem citada')
  const Icon = type === 'video' ? Video : Camera
  const contacts = quotedMessage?.contacts ?? reply.contacts
  const contactNames =
    type === 'contact'
      ? contacts
          .map(
            (contact) =>
              contact.name || contact.parsed?.phones[0]?.number || 'Contato compartilhado',
          )
          .join(', ')
      : null
  const text = deleted
    ? 'Mensagem removida'
    : (quotedMessage?.text ??
      reply.text ??
      contactNames ??
      reply.media?.fileName ??
      messagePreview({ ...reply, deletedAt: null }))
  return (
    <button
      type="button"
      aria-label="Ir para mensagem citada"
      disabled={!onNavigate}
      onClick={() => onNavigate?.(reply)}
      className="mb-2 flex w-full min-w-0 overflow-hidden rounded-lg border-l-4 border-primary bg-muted/50 text-left text-xs [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
    >
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="mb-1 truncate font-semibold text-primary">{author}</p>
        <p className="flex items-start gap-1.5 text-muted-foreground">
          {visual && <Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />}
          <span className="line-clamp-3">
            <MessageFormattedText
              text={
                visual
                  ? quotedMessage?.text || reply.text || (type === 'image' ? 'Foto' : 'Vídeo')
                  : text
              }
              links={false}
            />
          </span>
        </p>
      </div>
      {thumbnailUrl && thumbnailUrl !== failedThumbnail && (
        <img
          src={thumbnailUrl}
          alt={type === 'image' ? 'Miniatura da foto citada' : 'Miniatura do vídeo citado'}
          className="size-16 shrink-0 self-center object-cover"
          onError={() => setFailedThumbnail(thumbnailUrl)}
        />
      )}
    </button>
  )
}
