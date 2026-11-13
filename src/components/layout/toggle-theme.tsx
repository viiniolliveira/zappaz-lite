import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { SidebarMenuButton } from '@/components/ui/sidebar'

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export default function ToggleTheme() {
  const { theme, setTheme, systemTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)

  if (!mounted) return null

  const resolvedTheme = theme === 'system' ? systemTheme : theme
  const isDark = resolvedTheme === 'dark'

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  const label = isDark ? 'Ativar tema claro' : 'Ativar tema escuro'

  return (
    <SidebarMenuButton
      tooltip={label}
      aria-label={label}
      onClick={handleToggle}
      className="h-9 cursor-pointer w-full justify-start text-muted-foreground hover:bg-primary/90 hover:text-primary-foreground transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:size-4!"
    >
      {isDark ? <MoonIcon className="size-5!" /> : <SunIcon className="size-5!" />}
      <span className="group-data-[collapsible=icon]:hidden">{isDark ? 'Escuro' : 'Claro'}</span>
    </SidebarMenuButton>
  )
}
