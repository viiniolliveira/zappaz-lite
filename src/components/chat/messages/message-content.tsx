import { FileQuestion } from 'lucide-react'
import type { ReactNode } from 'react'
import type { OpenChatMedia } from '@/lib/chat/media-library'
import type { MessageDTO } from '@/lib/chat/schemas'
import { cn } from '@/lib/utils'
import type { AudioSender } from './message-audio'
import MessageContacts from './message-contacts'
import MessageGroupInvite from './message-group-invite'
import MessageInteractive from './message-interactive'
import MessageLocation from './message-location'
import MessageMedia from './message-media'
import MessageNotice from './message-notice'
import MessagePoll from './message-poll'
import MessageText from './message-text'

export default function MessageContent({
  message,
  audioSender,
  mediaOverlay,
  tile = false,
  fullWidth = false,
  onOpenMedia,
}: {
  message: MessageDTO
  audioSender?: AudioSender
  mediaOverlay?: ReactNode
  tile?: boolean
  fullWidth?: boolean
  onOpenMedia?: OpenChatMedia
}) {
  if (message.interactive) {
    return (
      <MessageInteractive message={message} metadata={!message.media ? mediaOverlay : undefined}>
        <MessageContent
          message={{ ...message, interactive: null }}
          audioSender={audioSender}
          mediaOverlay={mediaOverlay}
          tile={tile}
          fullWidth
          onOpenMedia={onOpenMedia}
        />
      </MessageInteractive>
    )
  }
  // Inline-size containment keeps captions out of the media's intrinsic width.
  const visualMedia =
    !!message.media && !tile && (message.type === 'image' || message.type === 'video')
  switch (message.type) {
    case 'poll':
      return <MessagePoll poll={message.poll} />
    case 'group_invite':
      return <MessageGroupInvite message={message} />
    case 'album':
      return null
    case 'system':
    case 'unavailable':
      return <MessageNotice message={message} />
    case 'text':
      return <MessageText text={message.text} linkPreview={message.linkPreview} />
    case 'location':
      return (
        <div className="space-y-2 text-sm">
          <MessageLocation location={message.location} />
          {message.text && (
            <div className="px-2">
              <MessageText text={message.text} />
            </div>
          )}
        </div>
      )
    case 'contact':
      return (
        <div className="space-y-2 text-sm">
          <MessageContacts contacts={message.contacts} metadata={mediaOverlay} />
          {message.text && (
            <div className="px-2 pb-1">
              <MessageText text={message.text} />
            </div>
          )}
        </div>
      )
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return (
        <div
          className={cn(
            'space-y-2 text-sm',
            visualMedia && (fullWidth ? 'w-full min-w-0' : 'w-fit max-w-full'),
          )}
        >
          {message.media ? (
            <MessageMedia
              key={message.media.id}
              media={message.media}
              sender={audioSender}
              overlay={mediaOverlay}
              tile={tile}
              fullWidth={fullWidth}
              onOpen={onOpenMedia ? (blob) => onOpenMedia(message.id, blob) : undefined}
            />
          ) : (
            <p>Arquivo indisponível</p>
          )}
          {message.text && (
            <div
              className={cn(
                (message.type === 'image' ||
                  message.type === 'video' ||
                  message.type === 'document') &&
                  'px-2 pb-1',
                visualMedia && '[contain:inline-size]',
              )}
            >
              <MessageText text={message.text} />
            </div>
          )}
        </div>
      )
    case 'unknown':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileQuestion aria-hidden="true" className="size-4" />
          Conteúdo não suportado
        </p>
      )
  }
}
