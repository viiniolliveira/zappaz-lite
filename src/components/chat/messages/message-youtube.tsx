import { Link2 } from 'lucide-react'
import { YouTubePlayer } from '@/components/ui/youtube-video-player'
import MessageFormattedText from './message-formatted-text'

export default function MessageYouTube({ videoId, text }: { videoId: string; text?: string }) {
  const lines = text?.split('\n').filter((line) => line.trim()) ?? []
  const hasHeading = lines.length > 1 && !/https?:\/\//i.test(lines[0])
  const title = hasHeading ? lines[0] : 'Vídeo do YouTube'
  const description = hasHeading ? lines.slice(1).join('\n') : text
  return (
    <div
      data-slot="message-youtube"
      className="w-[min(26rem,70vw)] max-w-full overflow-hidden rounded-t-xl"
    >
      <YouTubePlayer videoId={videoId} title={title} />
      <div className="space-y-2 bg-black/10 px-3 py-3 dark:bg-black/15">
        <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
          <MessageFormattedText text={title} />
        </p>
        {description && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/65 [overflow-wrap:anywhere]">
            <MessageFormattedText text={description} />
          </p>
        )}
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir no YouTube"
          className="flex w-fit items-center gap-2 pt-1 text-sm text-foreground/80 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Link2 aria-hidden="true" className="size-4" />
          youtu.be
        </a>
      </div>
    </div>
  )
}
