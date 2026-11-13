import { createContext, useContext } from 'react'
import type { AudioPlayerController } from '@/hooks/use-audio-player'

interface AudioPlayerContextValue {
  player: AudioPlayerController
  onPrevious?: () => void
  onNext?: () => void
}

export const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null)

export function useAudioPlayerPart(part: string): AudioPlayerContextValue {
  const context = useContext(AudioPlayerContext)
  if (!context) throw new Error(`${part} must be used inside AudioPlayer.`)
  return context
}

export const useAudioPlayerContext = (): AudioPlayerController =>
  useAudioPlayerPart('useAudioPlayerContext').player
