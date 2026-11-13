import type { MessageDTO } from '@/lib/chat/schemas'
import { youtubeVideosInText } from '@/lib/chat/youtube'
import MessageFormattedText from './message-formatted-text'
import MessageLinkPreview from './message-link-preview'
import MessageYouTube from './message-youtube'

export default function MessageText({
  text,
  linkPreview = null,
}: {
  text: string | null
  linkPreview?: MessageDTO['linkPreview']
}) {
  if (!text) return null
  const videos = youtubeVideosInText(text)
  const content = (
    <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
      <MessageFormattedText text={text} />
    </p>
  )
  if (!videos.length)
    return linkPreview ? (
      <div className="w-[clamp(16rem,30vw,22rem)] max-w-full space-y-2">
        <MessageLinkPreview key={linkPreview.url} preview={linkPreview} />
        <div className="px-2">{content}</div>
      </div>
    ) : (
      content
    )
  return (
    <div className="space-y-2">
      {videos.map((videoId, index) => (
        <MessageYouTube key={videoId} videoId={videoId} text={index === 0 ? text : undefined} />
      ))}
    </div>
  )
}
