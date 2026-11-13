import type { ReactNode } from 'react'
import { ProvidedContext } from '@/hooks/use-audio-context'

export function AudioContextProvider({
  context,
  children,
}: {
  context: AudioContext
  children: ReactNode
}) {
  return <ProvidedContext.Provider value={context}>{children}</ProvidedContext.Provider>
}
