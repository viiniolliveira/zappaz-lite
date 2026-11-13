import { describe, expect, test } from 'bun:test'
import { computeAudioPeaks } from '../../src/lib/audio/peaks'

describe('computeAudioPeaks', () => {
  test('combines channels, takes absolute bucket maxima and normalizes globally', () => {
    const channels = [new Float32Array([0, -0.25, 0.1, 0]), new Float32Array([0.5, 0, -1, 0.2])]
    expect(Array.from(computeAudioPeaks(channels, 2))).toEqual([0.5, 1])
    expect(Array.from(channels[0])).toEqual([0, -0.25, 0.10000000149011612, 0])
  })

  test('returns finite zeros for silence and ignores non-finite sample values', () => {
    expect(Array.from(computeAudioPeaks([new Float32Array(4)], 2))).toEqual([0, 0])
    expect(Array.from(computeAudioPeaks([new Float32Array([NaN, Infinity, -Infinity, -2])], 4))).toEqual([0, 0, 0, 1])
  })

  test('handles empty input and caps output at input length and default sample count', () => {
    expect(computeAudioPeaks([])).toHaveLength(0)
    expect(computeAudioPeaks([new Float32Array(0)])).toHaveLength(0)
    expect(computeAudioPeaks([new Float32Array(3)], 100)).toHaveLength(3)
    expect(computeAudioPeaks([new Float32Array(500)])).toHaveLength(160)
  })

  test('rejects invalid sample counts even for empty channels', () => {
    for (const samples of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => computeAudioPeaks([], samples)).toThrow('Quantidade de amostras inválida')
    }
  })
})
