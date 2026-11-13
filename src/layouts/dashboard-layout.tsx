import { useAtom, useAtomValue } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { sessionsAtom } from '@/atoms/session'
import { selectedChatIdAtom } from '@/atoms/ui'
import AppRealtime from '@/components/layout/app-realtime'
import { SideBarWrapper } from '@/components/layout/app-sidebar'
import UserIcon from '@/components/layout/user-icon'
import { Button } from '@/components/ui/button'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ApiError } from '@/lib/api-error'
import { cn } from '@/lib/utils'

export function DashboardLayout() {
  const isChat = useLocation().pathname === '/chat'
  const selectedChatId = useAtomValue(selectedChatIdAtom)
  const [navOpen, setNavOpen] = useState(true)
  const [{ data, isPending, isError, error, refetch }] = useAtom(sessionsAtom)

  if (isPending) {
    return (
      <div role="status" className="flex min-h-dvh w-full items-center justify-center gap-3">
        <Loader2Icon aria-hidden="true" className="size-6 animate-spin text-primary" />
        <span className="sr-only">Carregando sessões</span>
      </div>
    )
  }

  if (isError && error instanceof ApiError && error.status === 401) {
    return <Navigate to="/sign-in" replace />
  }

  if (isError && !data) {
    return (
      <div
        role="alert"
        className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted-foreground"
      >
        <p>Não foi possível verificar sua sessão.</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <SidebarProvider open={navOpen} onOpenChange={setNavOpen}>
      <AppRealtime />
      <SideBarWrapper
        className={
          isChat
            ? 'border-r pr-0 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : undefined
        }
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:shadow-md"
      >
        Pular para o conteúdo
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          'relative flex min-w-0 flex-1 flex-col items-center',
          isChat
            ? 'h-dvh min-h-0 overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
            : 'min-h-dvh gap-6 px-4 pt-4 pb-12 sm:px-6 md:px-8 md:pt-12',
        )}
      >
        <div
          className={cn(
            'w-full shrink-0 md:hidden flex justify-between items-center p-2',
            isChat ? 'border-b bg-background' : 'border rounded-lg bg-card',
            isChat && selectedChatId && 'hidden',
          )}
        >
          <SidebarTrigger size="lg" />
          <UserIcon />
        </div>
        <div className={cn('w-full min-w-0', isChat ? 'min-h-0 flex-1' : 'mx-auto max-w-5xl')}>
          <Outlet />
        </div>
      </main>
    </SidebarProvider>
  )
}
