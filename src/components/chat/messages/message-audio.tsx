import { Download, Loader2, Mic, Pause, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import {
  AudioPlayer,
  AudioPlayerPlay,
  AudioPlayerSeek,
  AudioPlayerTime,
} from '@/components/ui/audio-player'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Waveform, WaveformCanvas, WaveformCursor } from '@/components/ui/waveform'
import { useAudioPlayerContext } from '@/hooks/use-audio-player-context'
import { useAudioWaveform } from '@/hooks/use-audio-waveform'
import { useChatMedia } from '@/hooks/use-chat-media'
import { formatTime } from '@/lib/audio/time'
import type { MediaDTO } from '@/lib/chat/schemas'
import { contactInitials } from '@/lib/chat/types'

export interface AudioSender {
  name: string
  avatarUrl: string | null
}

function AudioTransport({
  available,
  loading,
  failed,
  onRequest,
}: {
  available: boolean
  loading: boolean
  failed: boolean
  onRequest: () => void
}) {
  const player = useAudioPlayerContext()
  if (!available)
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0"
        aria-label={
          loading ? 'Carregando áudio' : failed ? 'Tentar baixar áudio novamente' : 'Baixar áudio'
        }
        disabled={loading}
        onClick={onRequest}
      >
        {loading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : failed ? (
          <RotateCcw aria-hidden="true" className="size-4" />
        ) : (
          <Download aria-hidden="true" className="size-4" />
        )}
      </Button>
    )
  return (
    <AudioPlayerPlay
      aria-label={player.playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      className="size-9 bg-transparent text-foreground hover:bg-foreground/10"
    >
      {({ playing, loading: buffering }) =>
        buffering ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : playing ? (
          <Pause aria-hidden="true" className="size-4 fill-current" />
        ) : (
          <Play aria-hidden="true" className="size-4 fill-current" />
        )
      }
    </AudioPlayerPlay>
  )
}

function AudioTimeline({ blob, duration }: { blob: Blob | null; duration: number | null }) {
  const player = useAudioPlayerContext()
  const waveform = useAudioWaveform(blob)
  const length = player.duration || waveform.duration || duration || 0
  return (
    <div className="min-w-0 flex-1 pt-1">
      {waveform.error ? (
        <AudioPlayerSeek aria-label="Posição do áudio" className="h-7 min-w-0" />
      ) : (
        <Waveform
          aria-label="Posição do áudio"
          className="h-7 min-w-0 [--waveform:var(--muted-foreground)] [--waveform-progress:var(--primary)] [--waveform-cursor:var(--primary)]"
          peaks={waveform.peaks}
          duration={length}
          time={player.time}
          currentTime={player.currentTime}
          disabled={!blob}
          barWidth={3}
          barGap={2}
          barRadius={2}
          onSeekCommitted={player.seek}
        >
          <WaveformCanvas />
          <WaveformCursor className="inset-y-auto top-1/2 size-3 -translate-y-1/2 rounded-full" />
        </Waveform>
      )}
      <div className="mt-1 flex items-center justify-between gap-2">
        <AudioPlayerTime className="text-left font-sans" aria-label="Tempo decorrido" />
        <AudioPlayerTime
          type="duration"
          className="font-sans"
          aria-label="Duração do áudio"
          format={(seconds) => formatTime(seconds || duration || 0)}
        />
      </div>
      {waveform.error && (
        <span className="sr-only">Forma de onda indisponível. Use a barra de posição.</span>
      )}
    </div>
  )
}

export default function MessageAudio({
  media,
  sender,
  sourceBlob = null,
}: {
  media: MediaDTO
  sender?: AudioSender
  sourceBlob?: Blob | null
}) {
  const [playerError, setPlayerError] = useState(false)
  const { elementRef, url, blob, state, retry } = useChatMedia(media, true, sourceBlob)
  const name = sender?.name ?? 'Contato'
  const failed = state === 'error' || playerError
  return (
    <div ref={elementRef} className="w-72 max-w-full" data-slot="message-audio">
      <AudioPlayer
        src={url ?? undefined}
        preload="metadata"
        onError={() => setPlayerError(true)}
        aria-label={media.voice ? 'Mensagem de voz' : (media.fileName ?? 'Mensagem de áudio')}
        className="flex-nowrap items-center gap-2"
      >
        <div className="relative shrink-0">
          <Avatar className="size-12" aria-label={name}>
            {sender?.avatarUrl && <AvatarImage src={sender.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/15 text-sm text-foreground">
              {contactInitials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5 text-primary">
            <Mic aria-hidden="true" className="size-4" />
          </span>
        </div>
        <AudioTransport
          available={!!url}
          loading={state === 'idle' || state === 'loading'}
          failed={failed}
          onRequest={() => {
            setPlayerError(false)
            retry()
          }}
        />
        <AudioTimeline blob={blob} duration={media.duration} />
      </AudioPlayer>
      {failed && (
        <div role="alert" className="mt-2 text-xs text-destructive">
          Não foi possível abrir o áudio.
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setPlayerError(false)
              retry()
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </div>
  )
}
