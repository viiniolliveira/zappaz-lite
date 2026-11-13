/**
 * Adapted from Kokonut UI AI Voice v2.1.0 (MIT), https://kokonutui.com.
 * Controlled inline presentation; recording and playback use real browser audio.
 */
import { ArrowUp, Loader2, Mic, Pause, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AIVoiceProps {
  recording: boolean
  requesting: boolean
  playing: boolean
  sending: boolean
  disabled?: boolean
  canResume: boolean
  uncertain?: boolean
  seconds: number
  levels: number[]
  canPreview: boolean
  onDiscard: () => void
  onPause: () => void
  onResume: () => void
  onPlay: () => void
  onSend: () => void
}

export default function AIVoice({
  recording,
  requesting,
  playing,
  sending,
  disabled,
  canResume,
  uncertain,
  seconds,
  levels,
  canPreview,
  onDiscard,
  onPause,
  onResume,
  onPlay,
  onSend,
}: AIVoiceProps) {
  const whole = Math.floor(seconds)
  const timer = `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`
  const bars = Array.from({ length: 48 }, (_, index) => levels[index - (48 - levels.length)] ?? 0)
  return (
    // biome-ignore lint/a11y/useSemanticElements: This group contains media controls rather than form fields.
    <div
      className="flex min-h-16 w-full min-w-0 items-center gap-1 px-2 py-2 sm:gap-2"
      role="group"
      aria-label="Gravador de mensagem de voz"
      aria-busy={sending || requesting}
    >
      <Button
        autoFocus
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Cancelar gravação"
        title="Cancelar gravação"
        disabled={sending}
        onClick={onDiscard}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      {!recording && !requesting && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={playing ? 'Pausar prévia' : 'Ouvir gravação'}
          title={playing ? 'Pausar prévia' : 'Ouvir gravação'}
          disabled={!canPreview || sending}
          onClick={onPlay}
        >
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
      )}
      <div
        aria-hidden="true"
        className="flex h-8 min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
      >
        {bars.map((level, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: Fixed waveform slots have no item state or identity.
            key={index}
            className={cn(
              'h-full min-w-0 flex-1 rounded-full motion-safe:transition-transform motion-safe:duration-75',
              recording ? 'bg-primary' : 'bg-muted-foreground/60',
            )}
            style={{ transform: `scaleY(${Math.max(0.1, level)})` }}
          />
        ))}
      </div>
      <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            recording ? 'bg-destructive' : 'bg-muted-foreground',
          )}
        />
        {timer}
      </span>
      {!requesting && canResume && (
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label={recording ? 'Pausar gravação' : 'Retomar gravação'}
          title={recording ? 'Pausar gravação' : 'Retomar gravação'}
          disabled={sending || disabled || uncertain}
          onClick={recording ? onPause : onResume}
        >
          {recording ? (
            <Pause aria-hidden="true" className="text-destructive" />
          ) : (
            <Mic aria-hidden="true" />
          )}
        </Button>
      )}
      <Button
        type="button"
        size="icon-lg"
        className="rounded-full"
        aria-label="Enviar áudio"
        title="Enviar áudio"
        disabled={requesting || sending || disabled || uncertain || seconds <= 0}
        onClick={onSend}
      >
        {sending || requesting ? (
          <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
        ) : (
          <ArrowUp aria-hidden="true" />
        )}
      </Button>
      <span role="status" className="sr-only">
        {requesting
          ? 'Aguardando permissão do microfone'
          : sending
            ? 'Enviando áudio'
            : recording
              ? 'Gravando áudio'
              : 'Gravação pausada'}
      </span>
    </div>
  )
}
