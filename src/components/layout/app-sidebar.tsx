import { useAtomValue } from 'jotai'
import {
  BookText,
  ChartLine,
  House,
  KeyRound,
  Logs,
  MessageCircle,
  User as UserIcon,
  Users,
} from 'lucide-react'
import { Suspense } from 'react'
import { Link, useLocation } from 'react-router'
import { userAtom } from '@/atoms/auth'
import ToggleTheme from '@/components/layout/toggle-theme'
import { Logo } from '@/components/logo'
import { Avatar } from '@/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { API_URL } from '@/lib/api-client'

import LogoutButton from './logout-button'

const navMain = [
  { title: 'Sessões', url: '/sessions', Icon: House },
  { title: 'Chat', url: '/chat', Icon: MessageCircle },
  { title: 'Uso', url: '/use', Icon: ChartLine },
  { title: 'Logs', url: '/logs', Icon: Logs },

  { title: 'Minha conta', url: '/account', Icon: UserIcon },
  { title: 'Chaves de API', url: '/api-keys', Icon: KeyRound },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const { data: user, isError } = useAtomValue(userAtom)
  const items =
    user?.role === 'ADMIN' && !isError
      ? [...navMain, { title: 'Usuários', url: '/users', Icon: Users }]
      : navMain

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center group-data-[collapsible=icon]:justify-center">
            <Link
              to="/sessions"
              aria-label="Zappaz — Sessões"
              className="flex min-w-0 flex-1 items-center gap-2 p-3 group-data-[collapsible=icon]:hidden"
            >
              <Avatar className="w-full rounded-sm gap-4">
                <Logo />
              </Avatar>
            </Link>
            <SidebarTrigger className="shrink-0" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1 px-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            {items.map((item) => {
              const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`)
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    size="default"
                    isActive={isActive}
                    tooltip={item.title}
                    className="h-9 w-full justify-start data-[active=true]:bg-primary data-[active=true]:text-primary-foreground text-muted-foreground hover:bg-primary/90 hover:text-primary-foreground transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:size-4!"
                    asChild
                  >
                    <Link
                      to={item.url}
                      aria-label={item.title}
                      aria-current={isActive ? 'page' : undefined}
                      className="w-full flex items-center gap-2"
                    >
                      {item.Icon ? <item.Icon className="size-5!" /> : <span />}
                      <span className="text-sm group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <div className="border-t mt-2 border-solid border-e-secondary mx-3"></div>
        <SidebarGroup>
          <SidebarMenu className="gap-1 px-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Documentação"
                className="h-9 cursor-pointer w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:size-4!"
                asChild
              >
                <a
                  href={`${API_URL}/docs`}
                  aria-label="Documentação"
                  className="w-full flex items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookText className="size-5!" />
                  <span className="text-sm group-data-[collapsible=icon]:hidden">Documentação</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="MCP"
                className="h-9 cursor-pointer w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:size-4!"
                asChild
              >
                <Link
                  to={`${API_URL}/docs#description/como-configurar-o-mcp`}
                  aria-label="MCP"
                  className="w-full flex items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    aria-hidden="true"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5!"
                  >
                    <path
                      d="M3.49994 11.7501L11.6717 3.57855C12.7762 2.47398 14.5672 2.47398 15.6717 3.57855C16.7762 4.68312 16.7762 6.47398 15.6717 7.57855M15.6717 7.57855L9.49994 13.7501M15.6717 7.57855C16.7762 6.47398 18.5672 6.47398 19.6717 7.57855C20.7762 8.68312 20.7762 10.474 19.6717 11.5785L12.7072 18.543C12.3167 18.9335 12.3167 19.5667 12.7072 19.9572L13.9999 21.2499"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M17.4999 9.74921L11.3282 15.921C10.2237 17.0255 8.43272 17.0255 7.32823 15.921C6.22373 14.8164 6.22373 13.0255 7.32823 11.921L13.4999 5.74939"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-sm group-data-[collapsible=icon]:hidden">MCP</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroup className="group-data-[collapsible=icon]:p-0">
          <SidebarMenu className="gap-1 px-1 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarMenuItem>
              <ToggleTheme />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <LogoutButton />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  )
}

export const SideBarWrapper = (props: React.ComponentProps<typeof Sidebar>) => {
  return (
    <Suspense fallback={<div className="w-64" />}>
      <AppSidebar {...props} />
    </Suspense>
  )
}
