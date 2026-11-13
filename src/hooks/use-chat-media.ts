import { useEffect, useRef, useState } from 'react'
import type { MediaDTO } from '@/lib/chat/schemas'
import { getChatMediaContent, type MediaContentRequest } from '@/services/chat'

// Share the download limit across mounted chat surfaces, not per media card.
let activeDownloads = 0
const waiting: Array<() => void> = []
async function download(
  media: MediaContentRequest,
  signal: AbortSignal,
  onStart: () => void,
): Promise<Blob> {
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      signal.removeEventListener('abort', cancel)
      activeDownloads++
      onStart()
      resolve()
    }
    const cancel = () => {
      const index = waiting.indexOf(start)
      if (index >= 0) waiting.splice(index, 1)
      reject(new DOMException('Download cancelado', 'AbortError'))
    }
    if (signal.aborted) {
      cancel()
      return
    }
    if (activeDownloads < 3) start()
    else {
      waiting.push(start)
      signal.addEventListener('abort', cancel, { once: true })
    }
  })
  try {
    return await getChatMediaContent(media, signal)
  } finally {
    activeDownloads--
    waiting.shift()?.()
  }
}

export function useChatMedia(
  media: MediaDTO,
  enabled: boolean,
  sourceBlob: Blob | null = null,
  loading: 'when-visible' | 'immediate' = 'when-visible',
) {
  const { id, sessionId, conversationId, contentPath } = media
  const elementRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = `${sessionId}/${conversationId}/${id}/${contentPath}`
  const [result, setResult] = useState<{
    key: string | null
    url: string | null
    blob: Blob | null
    state: 'idle' | 'loading' | 'ready' | 'error'
  }>({ key: null, url: null, blob: null, state: 'idle' })
  useEffect(() => {
    const element = elementRef.current
    if (!element || !enabled || loading === 'immediate') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled, loading])

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly restarts a failed download when retry is requested.
  useEffect(() => {
    if (!enabled || (!visible && loading !== 'immediate')) return
    const controller = new AbortController()
    let url: string | null = null
    const request = sourceBlob
      ? Promise.resolve(sourceBlob)
      : download({ id, sessionId, conversationId, contentPath }, controller.signal, () =>
          setResult({ key, state: 'loading', url: null, blob: null }),
        )
    void request
      .then((blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setResult({ key, state: 'ready', url, blob })
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, state: 'error', url: null, blob: null })
      })
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [
    enabled,
    visible,
    id,
    sessionId,
    conversationId,
    contentPath,
    attempt,
    key,
    sourceBlob,
    loading,
  ])

  const current = result.key === key ? result : { url: null, blob: null, state: 'idle' as const }
  return {
    elementRef,
    ...current,
    retry: () => {
      setVisible(true)
      setAttempt((value) => value + 1)
    },
  }
}
