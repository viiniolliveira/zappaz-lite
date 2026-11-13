import { createContext, useContext } from 'react'
import type { BallisticsInput } from '@/lib/audio/ballistics'
import type { MeterZone, Orientation } from '@/lib/audio/types'

export type AudioSize = 'sm' | 'default' | 'lg'
export interface AudioConfig {
  orientation?: Orientation
  size?: AudioSize
  disabled?: boolean
  dimmed?: boolean
  minDb?: number
  maxDb?: number
  zones?: MeterZone[]
  ballistics?: BallisticsInput
}
export const AudioConfigContext = createContext<AudioConfig>({})
export const useAudioConfig = (): AudioConfig => useContext(AudioConfigContext)
