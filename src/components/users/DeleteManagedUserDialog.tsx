import { useAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'

import { deleteManagedUserAtom } from '@/atoms/users'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { User } from '@/services/types'

interface DeleteManagedUserDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
  user: User | null
}

export default function DeleteManagedUserDialog({
  onOpenChange,
  open,
  user,
}: DeleteManagedUserDialogProps) {
  const [{ mutateAsync, isPending }] = useAtom(deleteManagedUserAtom)

  if (!user) return null

  const handleDelete = async () => {
    try {
      await mutateAsync(user.id)
      onOpenChange(false)
    } catch {
      // A mutação já exibe a mensagem de erro ao usuário.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir usuário?</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O usuário {user.firstName} {user.lastName} (
            {user.email}) será removido permanentemente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
            Excluir usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
