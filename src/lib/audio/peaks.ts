/** Reduce decoded channels to bounded, normalized peak amplitudes. */
export function computeAudioPeaks(channels: readonly Float32Array[], samples = 160): Float32Array {
  if (!Number.isInteger(samples) || samples < 1) throw new Error('Quantidade de amostras inválida')
  const length = channels[0]?.length ?? 0
  if (!length) return new Float32Array(0)
  const count = Math.min(samples, length)
  const peaks = new Float32Array(count)
  let maximum = 0
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * length) / count)
    const end = Math.floor(((bucket + 1) * length) / count)
    let peak = 0
    for (const channel of channels) {
      for (let index = start; index < end; index++) {
        const value = Math.abs(channel[index] ?? 0)
        if (Number.isFinite(value)) peak = Math.max(peak, value)
      }
    }
    peaks[bucket] = peak
    maximum = Math.max(maximum, peak)
  }
  if (maximum > 0) for (let index = 0; index < count; index++) peaks[index] /= maximum
  return peaks
}
