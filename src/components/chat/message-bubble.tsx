import type { OpenChatMedia } from '@/lib/chat/media-library'
import type { ReplyDTO } from '@/lib/chat/schemas'
import type { ChatMessage } from '@/lib/chat/types'
import { youtubeVideosInText } from '@/lib/chat/youtube'
import MessageActions from './messages/message-actions'
import type { AudioSender } from './messages/message-audio'
import MessageContent from './messages/message-content'
import MessageFrame from './messages/message-frame'
import MessageMetadata from './messages/message-metadata'
import MessageReactions from './messages/message-reactions'
import MessageReply from './messages/message-reply'

export default function MessageBubble({
  message,
  quotedMessage,
  contactName,
  audioSender,
  grouped = false,
  highlighted = false,
  onNavigateReply,
  onOpenMedia,
}: {
  message: ChatMessage
  quotedMessage?: ChatMessage
  contactName?: string
  audioSender?: AudioSender
  grouped?: boolean
  highlighted?: boolean
  onNavigateReply?: (reply: ReplyDTO) => void
  onOpenMedia?: OpenChatMedia
}) {
  if (message.type === 'album') return null

  const sticker = message.type === 'sticker' && !message.deletedAt
  const youtube =
    message.type === 'text' &&
    !message.deletedAt &&
    youtubeVideosInText(message.text ?? '').length > 0
  const linkPreview = message.type === 'text' && !message.deletedAt && !!message.linkPreview
  const location = message.type === 'location' && !message.deletedAt
  const visualMedia =
    (message.type === 'image' || message.type === 'video') &&
    message.media?.kind === message.type &&
    !message.deletedAt
  const documentMedia =
    message.type === 'document' && message.media?.kind === 'document' && !message.deletedAt
  const contactCard =
    message.type === 'contact' && message.contacts.length > 0 && !message.deletedAt
  const interactiveCard = !!message.interactive && !message.deletedAt
  return (
    <MessageFrame
      id={message.id}
      fromMe={message.fromMe}
      sticker={sticker}
      compactMedia={
        visualMedia ||
        documentMedia ||
        contactCard ||
        interactiveCard ||
        youtube ||
        linkPreview ||
        location
      }
      grouped={grouped}
      highlighted={highlighted}
    >
      {message.deletedAt ? (
        <p className="text-sm italic text-muted-foreground">Mensagem removida</p>
      ) : (
        <>
          <MessageReply
            reply={message.replyTo}
            quotedMessage={quotedMessage}
            contactName={contactName}
            onNavigate={onNavigateReply}
          />
          <MessageContent
            message={message}
            onOpenMedia={onOpenMedia}
            tile={grouped}
            mediaOverlay={
              visualMedia || documentMedia || contactCard || interactiveCard ? (
                <MessageMetadata message={message} overlay={visualMedia} />
              ) : undefined
            }
            audioSender={
              audioSender ?? {
                name: message.fromMe ? 'Você' : (message.sender.name ?? 'Contato'),
                avatarUrl: null,
              }
            }
          />
          <MessageReactions reactions={message.reactions} />
          {!message.localStatus && message.messageId && <MessageActions message={message} />}
        </>
      )}
      {!visualMedia &&
        !documentMedia &&
        !contactCard &&
        !interactiveCard &&
        (youtube || linkPreview || location ? (
          <div className="px-2 pb-1">
            <MessageMetadata message={message} />
          </div>
        ) : (
          <MessageMetadata message={message} standalone={sticker} />
        ))}
    </MessageFrame>
  )
}
