'use client'

import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'jotai'
import { useHydrateAtoms } from 'jotai/react/utils'
import { queryClientAtom } from 'jotai-tanstack-query'

const queryClient = new QueryClient()

const HydrateAtoms = ({ children }: { children: React.ReactNode }) => {
  useHydrateAtoms(new Map([[queryClientAtom, queryClient]]))
  return children
}

export function AppQueryProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <Provider>
        <HydrateAtoms>{children}</HydrateAtoms>
      </Provider>
    </QueryClientProvider>
  )
}
