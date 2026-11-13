import { Outlet } from 'react-router'
import { BorderBeam } from '@/components/magicui/border-beam'

export function AuthLayout() {
  return (
    <div className="flex w-full min-h-dvh items-center justify-center p-6 md:p-10 bg-linear-to-tr from-primary/5 from-0% to-background/5 to-100%">
      <div className="w-full max-w-sm relative rounded-lg overflow-hidden">
        <Outlet />
        <BorderBeam
          duration={4}
          size={400}
          reverse
          className="from-transparent via-ring to-transparent"
        />
      </div>
    </div>
  )
}
