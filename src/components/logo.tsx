import { cn } from '@/lib/utils'

export function Logo({ className, ...props }: React.ComponentProps<'img'>) {
  return (
    <>
      <img
        src="/logo-dark.webp"
        width={180}
        height={60}
        alt="Logo"
        className={cn('hidden dark:block', className)}
        {...props}
      />
      <img
        src="/logo-light.webp"
        width={180}
        height={60}
        alt="Logo"
        className={cn('block dark:hidden', className)}
        {...props}
      />
    </>
  )
}
