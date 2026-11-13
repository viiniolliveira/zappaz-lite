import type { ReactNode } from 'react'
import AppearanceProvider from '@/components/appearance-provider'
import PwaUpdatePrompt from '@/components/pwa-update-prompt'
import { AppQueryProvider } from '@/components/query-client-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppQueryProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AppearanceProvider>{children}</AppearanceProvider>
        <Toaster position="top-right" />
        <PwaUpdatePrompt />
      </ThemeProvider>
    </AppQueryProvider>
  )
}
