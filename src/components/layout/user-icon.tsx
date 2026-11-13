import { User } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export default function UserIcon() {
  return (
    <Button variant="outline" size="icon" asChild>
      <Link to="/account" aria-label="Minha conta">
        <User />
      </Link>
    </Button>
  )
}
