import { Maximize, Minimize, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/audio/time'
import { cn } from '@/lib/utils'

export interface VideoPlayerProProps {
  src: string
  poster?: string
  label?: string
  className?: string
  onRetry?: () => void
}

const speeds = [0.5, 1, 1.5, 2] as const

function mediaError(error: MediaError | null): string {
  if (error?.code === 2)
    return 'Não foi possível carregar o vídeo. Tente baixar o arquivo novamente.'
  if (error?.code === 3) return 'O navegador não conseguiu decodificar este vídeo.'
  if (error?.code === 4) return 'Este formato de vídeo não é compatível com o navegador.'
  return 'Não foi possível reproduzir o vídeo. Tente novamente.'
}

/** CLI-installed Ruixen Video Player Pro, adapted for the app's theme and accessibility. */
export function VideoPlayerPro(props: VideoPlayerProProps) {
  return <VideoPlayerSession key={props.src} {...props} />
}

function VideoPlayerSession({
  src,
  poster,
  label = 'Vídeo da conversa',
  className,
  onRetry,
}: VideoPlayerProProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastVolume = useRef(1)
  const reducedMotion = useReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [show, setShow] = useState(true)
  const [activity, setActivity] = useState(0)
  const [focused, setFocused] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    const video = videoRef.current
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    if (container) observer.observe(container)
    const onFullscreen = () => setFullscreen(document.fullscreenElement === container)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', onFullscreen)
      video?.pause()
    }
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: User activity resets the controls auto-hide timer.
  useEffect(() => {
    if (!playing || focused || scrubbing) return
    const timer = setTimeout(() => setShow(false), 3000)
    return () => clearTimeout(timer)
  }, [playing, focused, scrubbing, activity])

  const revealControls = () => {
    setShow(true)
    setActivity((current) => current + 1)
  }
  const syncTime = () => {
    const video = videoRef.current
    if (!video) return
    setTime(Number.isFinite(video.currentTime) ? video.currentTime : 0)
    setDuration(Number.isFinite(video.duration) ? video.duration : 0)
  }
  const toggle = async () => {
    const video = videoRef.current
    if (!video) return
    revealControls()
    if (!video.paused) {
      video.pause()
      return
    }
    if (video.ended) video.currentTime = 0
    setError(null)
    try {
      await video.play()
    } catch (failure) {
      setError(
        failure instanceof DOMException && failure.name === 'NotAllowedError'
          ? 'O navegador bloqueou a reprodução. Clique em reproduzir para tentar novamente.'
          : mediaError(video.error),
      )
      setPlaying(false)
    }
  }
  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
    video.currentTime = Math.max(0, Math.min(video.duration, seconds))
    setTime(video.currentTime)
    revealControls()
  }
  const changeVolume = (value: number) => {
    const video = videoRef.current
    if (!video) return
    const next = Math.max(0, Math.min(1, value))
    video.volume = next
    video.muted = next === 0
    setVolume(next)
    setMuted(video.muted)
    if (next > 0) lastVolume.current = next
    revealControls()
  }
  const toggleMute = () => changeVolume(muted || volume === 0 ? lastVolume.current : 0)
  const toggleFullscreen = async () => {
    const container = containerRef.current
    if (!container) return
    setNotice(null)
    try {
      if (document.fullscreenElement === container) await document.exitFullscreen()
      else if (container.requestFullscreen) await container.requestFullscreen()
      else setNotice('Tela cheia não está disponível neste navegador.')
    } catch {
      setNotice('Não foi possível ativar a tela cheia. Tente novamente.')
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      (event.target instanceof HTMLElement && event.target.closest('input, select'))
    )
      return
    if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button'))
      return
    const actions: Record<string, () => void> = {
      ' ': () => {
        void toggle()
      },
      k: () => {
        void toggle()
      },
      ArrowLeft: () => seek(time - 5),
      ArrowRight: () => seek(time + 5),
      ArrowUp: () => changeVolume(volume + 0.1),
      ArrowDown: () => changeVolume(volume - 0.1),
      m: toggleMute,
      f: () => {
        void toggleFullscreen()
      },
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume > 0.5 ? Volume2 : Volume1
  const controlsVisible = show || !playing || focused || scrubbing
  const playLabel = ended
    ? 'Reproduzir vídeo novamente'
    : playing
      ? 'Pausar vídeo'
      : 'Reproduzir vídeo'
  const iconButton =
    'size-9 shrink-0 text-white/90 hover:bg-white/15 hover:text-white focus-visible:ring-white'

  return (
    // biome-ignore lint/a11y/useSemanticElements: Focusable player region handles media keyboard shortcuts.
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Focus enables the player keyboard shortcuts.
      tabIndex={0}
      data-slot="video-player-pro"
      onKeyDown={onKeyDown}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onFocusCapture={() => {
        setFocused(true)
        revealControls()
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
      className={cn(
        'relative flex size-full min-h-0 max-w-5xl items-center justify-center overflow-hidden rounded-xl bg-black text-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        aria-label={label}
        className="size-full object-contain"
        onClick={() => {
          void toggle()
        }}
        onTimeUpdate={syncTime}
        onLoadedMetadata={syncTime}
        onDurationChange={syncTime}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
          setError(null)
          revealControls()
        }}
        onPause={() => {
          setPlaying(false)
          setShow(true)
        }}
        onEnded={() => {
          setEnded(true)
          setPlaying(false)
          setShow(true)
        }}
        onError={() => {
          setError(mediaError(videoRef.current?.error ?? null))
          setPlaying(false)
        }}
      >
        <track kind="captions" />
      </video>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center text-sm text-white"
          >
            <p>{error}</p>
            <Button
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => {
                setError(null)
                setEnded(false)
                revealControls()
                if (onRetry) onRetry()
                else videoRef.current?.load()
              }}
            >
              Tentar novamente
            </Button>
          </motion.div>
        ) : (
          !playing && (
            <motion.button
              key="play"
              type="button"
              aria-label={playLabel}
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => {
                void toggle()
              }}
              className="absolute top-1/2 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white outline-offset-4 focus-visible:outline-2 focus-visible:outline-white"
            >
              {ended ? (
                <RotateCcw aria-hidden="true" className="size-6" />
              ) : (
                <Play aria-hidden="true" className="size-6 fill-current" />
              )}
            </motion.button>
          )
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {controlsVisible && !error && (
          <motion.div
            key="controls"
            initial={{ y: reducedMotion ? 0 : 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: reducedMotion ? 0 : 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute inset-x-3 bottom-3 z-20 flex flex-col gap-1 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-white backdrop-blur-xl"
          >
            <input
              type="range"
              aria-label="Posição do vídeo"
              aria-valuetext={`${formatTime(time)} de ${formatTime(duration)}`}
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration)}
              disabled={duration <= 0}
              onChange={(event) => seek(Number(event.target.value))}
              onPointerDown={() => setScrubbing(true)}
              onPointerUp={() => setScrubbing(false)}
              onPointerCancel={() => setScrubbing(false)}
              className="h-5 w-full cursor-pointer accent-white focus-visible:outline-2 focus-visible:outline-white"
            />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={playLabel}
                  className={iconButton}
                  onClick={() => {
                    void toggle()
                  }}
                >
                  {ended ? (
                    <RotateCcw aria-hidden="true" />
                  ) : playing ? (
                    <Pause aria-hidden="true" />
                  ) : (
                    <Play aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={muted ? 'Ativar som do vídeo' : 'Silenciar vídeo'}
                  className={iconButton}
                  onClick={toggleMute}
                >
                  <VolumeIcon aria-hidden="true" />
                </Button>
                {width >= 480 && (
                  <input
                    type="range"
                    aria-label="Volume do vídeo"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) => changeVolume(Number(event.target.value))}
                    className="h-5 w-16 cursor-pointer accent-white"
                  />
                )}
                <span className="shrink-0 text-xs text-white/90 tabular-nums">
                  {formatTime(time)} / {formatTime(duration)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {width >= 480 ? (
                  <LayoutGroup>
                    {/* biome-ignore lint/a11y/useSemanticElements: Playback command group. */}
                    <div
                      role="group"
                      aria-label="Velocidade do vídeo"
                      className="flex rounded-lg bg-white/10 p-0.5"
                    >
                      {speeds.map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`Velocidade ${value}x`}
                          aria-pressed={speed === value}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.playbackRate = value
                            setSpeed(value)
                            revealControls()
                          }}
                          className="relative isolate min-h-8 rounded-md px-2 text-xs text-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
                        >
                          {speed === value && (
                            <motion.span
                              layoutId="video-speed"
                              className="absolute inset-0 -z-10 rounded-md bg-white/20"
                              transition={
                                reducedMotion
                                  ? { duration: 0 }
                                  : { type: 'spring', stiffness: 500, damping: 35 }
                              }
                            />
                          )}
                          {value}x
                        </button>
                      ))}
                    </div>
                  </LayoutGroup>
                ) : (
                  <select
                    aria-label="Velocidade do vídeo"
                    value={speed}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (videoRef.current) videoRef.current.playbackRate = value
                      setSpeed(value)
                      revealControls()
                    }}
                    className="h-8 rounded-md border border-white/25 bg-black/80 px-1 text-xs text-white"
                  >
                    {speeds.map((value) => (
                      <option key={value} value={value}>
                        {value}x
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={fullscreen ? 'Sair da tela cheia do vídeo' : 'Tela cheia do vídeo'}
                  className={iconButton}
                  onClick={() => {
                    void toggleFullscreen()
                  }}
                >
                  {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {notice && (
        <p
          role="status"
          className="absolute top-3 inset-x-3 rounded bg-black/80 px-3 py-2 text-center text-xs text-white"
        >
          {notice}
        </p>
      )}
    </div>
  )
}

export default VideoPlayerPro
