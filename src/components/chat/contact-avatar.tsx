import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

export default function ContactAvatar({
  initials,
  avatarUrl,
  className,
}: {
  initials: string
  avatarUrl?: string | null
  className?: string
}) {
  return (
    <Avatar aria-hidden="true" className={cn('size-11', className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="bg-primary/10 font-medium text-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
