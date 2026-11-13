import { useEffect, useState } from 'react'
import { computeAudioPeaks } from '@/lib/audio/peaks'

/** Decodes the already downloaded Blob; never requests the media again. */
export function useAudioWaveform(blob: Blob | null) {
  const [result, setResult] = useState<{
    blob: Blob | null
    peaks: Float32Array | null
    duration: number
    error: Error | null
  }>({ blob: null, peaks: null, duration: 0, error: null })
  useEffect(() => {
    if (!blob) return
    let disposed = false
    const decode = async () => {
      if (typeof OfflineAudioContext === 'undefined')
        throw new Error('Forma de onda indisponível neste navegador')
      const context = new OfflineAudioContext(1, 1, 44100)
      const buffer = await context.decodeAudioData(await blob.arrayBuffer())
      if (disposed) return
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index),
      )
      if (!disposed)
        setResult({
          blob,
          peaks: computeAudioPeaks(channels),
          duration: buffer.duration,
          error: null,
        })
    }
    void decode().catch((error) => {
      if (!disposed)
        setResult({
          blob,
          peaks: null,
          duration: 0,
          error:
            error instanceof Error ? error : new Error('Não foi possível calcular a forma de onda'),
        })
    })
    return () => {
      disposed = true
    }
  }, [blob])
  return result.blob === blob ? result : { peaks: null, duration: 0, error: null }
}
