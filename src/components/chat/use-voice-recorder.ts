import { useAtomValue } from 'jotai'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { mediaMaxFileSizeBytesAtom } from '@/atoms/media'

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'ready'
const mimeTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']

interface RecordingSession {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  context: AudioContext | null
  timer: ReturnType<typeof setInterval>
  elapsed: number
  startedAt: number
  resolve: ((file: File | null) => void) | null
  finished: Promise<File | null> | null
}

export function useVoiceRecorder(disabled: boolean) {
  const maxBytes = useAtomValue(mediaMaxFileSizeBytesAtom)
  const [status, setStatus] = useState<RecordingStatus>('idle')
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>([])
  const [preview, setPreview] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<RecordingSession | null>(null)
  const generation = useRef(0)
  const pending = useRef<{ stream: MediaStream; context: AudioContext | null } | null>(null)
  const blocked = useRef(disabled)
  useEffect(() => {
    blocked.current = disabled
    if (disabled && session.current?.recorder.state === 'recording')
      session.current.recorder.pause()
  }, [disabled])

  function release(current: RecordingSession) {
    clearInterval(current.timer)
    current.stream.getTracks().forEach((track) => {
      track.stop()
    })
    if (current.context && current.context.state !== 'closed') {
      void current.context.close().catch(() => {
        setError(
          'Não foi possível liberar o processador de áudio. Recarregue a página antes de gravar novamente.',
        )
      })
    }
  }

  function cleanup() {
    generation.current += 1
    if (pending.current) {
      pending.current.stream.getTracks().forEach((track) => {
        track.stop()
      })
      const context = pending.current.context
      if (context && context.state !== 'closed')
        void context.close().catch(() => {
          setError('Não foi possível liberar o processador de áudio. Recarregue a página.')
        })
      pending.current = null
    }
    const current = session.current
    session.current = null
    if (!current) return
    if (current.recorder.state !== 'inactive') current.recorder.stop()
    release(current)
    current.resolve?.(null)
  }

  async function start() {
    if (blocked.current || session.current || status === 'requesting') return
    if (maxBytes === null) {
      setError('Limite de arquivos indisponível. Recarregue a página para tentar novamente.')
      return
    }
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError(
        'Este navegador não permite gravar áudio. Use um navegador atualizado com HTTPS ou localhost.',
      )
      return
    }
    const token = ++generation.current
    setStatus('requesting')
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType)
        throw new Error('Nenhum formato de gravação compatível está disponível neste navegador.')
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (token !== generation.current || blocked.current) {
        stream.getTracks().forEach((track) => {
          track.stop()
        })
        if (token === generation.current) setStatus('idle')
        return
      }
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
      pending.current = { stream, context: null }
      context = new AudioContext()
      pending.current.context = context
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      await context.resume()
      if (token !== generation.current || blocked.current) {
        stream.getTracks().forEach((track) => {
          track.stop()
        })
        if (context.state !== 'closed') await context.close()
        if (pending.current?.stream === stream) pending.current = null
        if (token === generation.current) setStatus('idle')
        return
      }
      const samples = new Uint8Array(analyser.fftSize)
      const current: RecordingSession = {
        recorder,
        stream,
        context,
        chunks: [],
        elapsed: 0,
        startedAt: performance.now(),
        resolve: null,
        finished: null,
        timer: setInterval(() => {
          if (session.current !== current || recorder.state !== 'recording') return
          setSeconds((current.elapsed + performance.now() - current.startedAt) / 1000)
          analyser.getByteTimeDomainData(samples)
          const rms = Math.sqrt(
            samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length,
          )
          setLevels((previous) => [...previous.slice(-47), Math.min(1, rms * 4)])
        }, 80),
      }
      session.current = current
      pending.current = null
      const elapsed = () => {
        if (!current.startedAt) return
        current.elapsed += performance.now() - current.startedAt
        current.startedAt = 0
        setSeconds(current.elapsed / 1000)
      }
      recorder.ondataavailable = (event) => {
        if (session.current !== current) return
        if (event.data.size) current.chunks.push(event.data)
        if (current.chunks.reduce((size, chunk) => size + chunk.size, 0) > maxBytes) {
          cleanup()
          setStatus('idle')
          setPreview(null)
          setError(`A gravação excedeu ${maxBytes / 1024 / 1024} MiB. Grave um áudio menor.`)
          return
        }
        if (recorder.state === 'paused')
          setPreview(new Blob(current.chunks, { type: recorder.mimeType }))
      }
      recorder.onpause = () => {
        if (session.current !== current) return
        elapsed()
        current.stream.getAudioTracks().forEach((track) => {
          track.enabled = false
        })
        recorder.requestData()
        setStatus('paused')
      }
      recorder.onresume = () => {
        if (session.current !== current) return
        current.startedAt = performance.now()
        setPreview(null)
        setStatus('recording')
      }
      recorder.onstop = () => {
        if (session.current !== current) return
        elapsed()
        release(current)
        const blob = new Blob(current.chunks, { type: recorder.mimeType })
        if (!blob.size) {
          setError('A gravação ficou vazia. Grave novamente.')
          setStatus('idle')
          session.current = null
          current.resolve?.(null)
          return
        }
        setPreview(blob)
        setStatus('ready')
        const extension = blob.type.startsWith('audio/ogg')
          ? 'ogg'
          : blob.type.startsWith('audio/mp4')
            ? 'm4a'
            : 'webm'
        current.resolve?.(new File([blob], `audio-${Date.now()}.${extension}`, { type: blob.type }))
      }
      recorder.onerror = () => {
        if (session.current !== current) return
        cleanup()
        setStatus('idle')
        setPreview(null)
        setError('A gravação foi interrompida pelo navegador. Grave novamente.')
      }
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (session.current === current && recorder.state !== 'inactive') {
            setError('O microfone foi desconectado. Confira o áudio antes de enviar.')
            void finish()
          }
        })
      })
      setSeconds(0)
      setLevels([])
      setPreview(null)
      recorder.start(1000)
      setStatus('recording')
    } catch (cause) {
      stream?.getTracks().forEach((track) => {
        track.stop()
      })
      if (context && context.state !== 'closed') await context.close()
      if (token !== generation.current) return
      cleanup()
      setStatus('idle')
      setError(
        cause instanceof DOMException && cause.name === 'NotAllowedError'
          ? 'Permita o acesso ao microfone no navegador para gravar áudio.'
          : cause instanceof DOMException && cause.name === 'NotFoundError'
            ? 'Nenhum microfone foi encontrado. Conecte um microfone e tente novamente.'
            : cause instanceof Error
              ? cause.message
              : 'Não foi possível iniciar a gravação.',
      )
    }
  }

  function pause() {
    if (session.current?.recorder.state === 'recording') session.current.recorder.pause()
  }
  function resume() {
    const current = session.current
    if (!current || blocked.current || current.recorder.state !== 'paused') return
    current.stream.getAudioTracks().forEach((track) => {
      track.enabled = true
    })
    current.recorder.resume()
  }
  function finish(): Promise<File | null> {
    const current = session.current
    if (!current) return Promise.resolve(null)
    if (current.finished) return current.finished
    current.finished = new Promise((resolve) => {
      current.resolve = resolve
    })
    if (current.recorder.state !== 'inactive') current.recorder.stop()
    return current.finished
  }
  function discard() {
    cleanup()
    setStatus('idle')
    setSeconds(0)
    setLevels([])
    setPreview(null)
    setError(null)
  }

  const startOnMount = useEffectEvent(() => {
    void start()
  })
  const disposeOnUnmount = useEffectEvent(cleanup)
  useEffect(() => {
    // Begin permission work only after mounting; StrictMode can cancel the first setup.
    let active = true
    queueMicrotask(() => {
      if (active) startOnMount()
    })
    return () => {
      active = false
      disposeOnUnmount()
    }
  }, [])

  return { status, seconds, levels, preview, error, start, pause, resume, finish, discard }
}
