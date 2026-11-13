import { useAtom } from 'jotai'
import { LogOut } from 'lucide-react'
import { logoutAtom } from '@/atoms/auth'
import { SidebarMenuButton } from '@/components/ui/sidebar'

export default function LogoutButton() {
  const [{ mutate: logOutUser }] = useAtom(logoutAtom)

  function handleLogOutuser() {
    logOutUser()
  }

  return (
    <SidebarMenuButton
      tooltip="Deslogar"
      aria-label="Deslogar"
      onClick={handleLogOutuser}
      className="h-9 cursor-pointer w-full justify-start text-muted-foreground hover:bg-primary/90 hover:text-primary-foreground transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:[&>svg]:size-4!"
    >
      <LogOut className="size-5!" />{' '}
      <span className="group-data-[collapsible=icon]:hidden">Deslogar</span>
    </SidebarMenuButton>
  )
}
