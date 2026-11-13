import { useEffect, useRef, useState } from 'react'
import AIVoice from '@/components/kokonutui/ai-voice'
import { useVoiceRecorder } from './use-voice-recorder'

export default function VoiceRecorder({
  disabled,
  onSend,
  onClose,
}: {
  disabled?: boolean
  onSend: (file: File) => boolean | Promise<boolean>
  onClose: () => void
}) {
  const recorder = useVoiceRecorder(Boolean(disabled))
  const [sending, setSending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const sendLock = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !recorder.preview) return
    const url = URL.createObjectURL(recorder.preview)
    audio.src = url
    return () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      URL.revokeObjectURL(url)
    }
  }, [recorder.preview])

  async function play() {
    const audio = audioRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    setError(null)
    try {
      await audio.play()
    } catch {
      setError('Não foi possível ouvir a prévia. Tente novamente ou retome a gravação.')
    }
  }
  async function send() {
    if (sendLock.current || disabled || uncertain) return
    sendLock.current = true
    setSending(true)
    setError(null)
    audioRef.current?.pause()
    try {
      const file = await recorder.finish()
      if (!file || !mounted.current) return
      if (await onSend(file)) {
        if (mounted.current) onClose()
      } else if (mounted.current) {
        setUncertain(true)
        setError(
          'Envio não confirmado. Confira o histórico antes de gravar e enviar novamente para evitar duplicação.',
        )
      }
    } catch (cause) {
      if (mounted.current) {
        setUncertain(true)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível confirmar o envio. Confira o histórico antes de reenviar.',
        )
      }
    } finally {
      sendLock.current = false
      if (mounted.current) setSending(false)
    }
  }
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: This previews a fresh microphone recording without a transcript. */}
      <audio
        ref={audioRef}
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setPosition(0)
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onError={() => {
          setPlaying(false)
          setError('Não foi possível reproduzir a prévia. A gravação foi preservada.')
        }}
      />
      <AIVoice
        recording={recorder.status === 'recording'}
        requesting={recorder.status === 'requesting'}
        playing={playing}
        sending={sending}
        disabled={disabled}
        canResume={recorder.status !== 'ready'}
        uncertain={uncertain}
        seconds={playing ? position : recorder.seconds}
        levels={recorder.levels}
        canPreview={Boolean(recorder.preview)}
        onDiscard={() => {
          recorder.discard()
          onClose()
        }}
        onPause={recorder.pause}
        onResume={() => {
          setError(null)
          audioRef.current?.pause()
          if (recorder.status === 'idle') void recorder.start()
          else recorder.resume()
        }}
        onPlay={() => {
          void play()
        }}
        onSend={() => {
          void send()
        }}
      />
      {(error || recorder.error) && (
        <p role="alert" className="px-3 pb-2 text-xs text-destructive">
          {error || recorder.error}
        </p>
      )}
    </>
  )
}
