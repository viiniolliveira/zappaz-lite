import { useAtomValue } from 'jotai'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'

import { getUsersAtom } from '@/atoms/users'
import { TablePagination } from '@/components/logs/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { User } from '@/services/types'

import DeleteManagedUserDialog from './DeleteManagedUserDialog'
import ManagedUserForm from './ManagedUserForm'
import UserFormDrawer from './UserFormDrawer'

type DrawerMode = 'create' | 'edit'

export default function UsersTable() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('create')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const usersQueryAtom = getUsersAtom({ page, pageSize })
  const { data: response, isPending, isFetching, isError, refetch } = useAtomValue(usersQueryAtom)
  const users = Array.isArray(response?.data) ? response.data : []
  const total = Number(response?.total) || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleDrawerChange = (open: boolean) => {
    setIsDrawerOpen(open)
    if (!open) setSelectedUser(null)
  }

  const openCreateDrawer = () => {
    setDrawerMode('create')
    setSelectedUser(null)
    setIsDrawerOpen(true)
  }

  const openEditDrawer = (user: User) => {
    setDrawerMode('edit')
    setSelectedUser(user)
    setIsDrawerOpen(true)
  }

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user)
    setIsDeleteDialogOpen(true)
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={openCreateDrawer}>
          <PlusIcon className="mr-2 size-4" />
          Adicionar usuário
        </Button>
      </div>

      <div className="border rounded-lg bg-background">
        <Table aria-busy={isPending || isFetching}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton rows never reorder or preserve state.
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton className="h-5 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-52" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-8 w-20" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Não foi possível carregar os usuários.
                  <Button className="ml-3" variant="outline" onClick={() => void refetch()}>
                    Tentar novamente
                  </Button>
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.firstName} {user.lastName}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                      {user.role === 'ADMIN' ? 'Administrador' : 'Usuário'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDrawer(user)}
                        aria-label={`Editar ${user.firstName} ${user.lastName}`}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => openDeleteDialog(user)}
                        aria-label={`Excluir ${user.firstName} ${user.lastName}`}
                      >
                        <Trash2Icon className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {users.length > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <UserFormDrawer
        open={isDrawerOpen}
        onOpenChange={handleDrawerChange}
        title={drawerMode === 'create' ? 'Adicionar usuário' : 'Editar usuário'}
        description={
          drawerMode === 'create'
            ? 'Preencha os dados para criar um novo acesso.'
            : 'Atualize os dados e as credenciais deste usuário.'
        }
      >
        <ManagedUserForm
          mode={drawerMode}
          user={selectedUser}
          onSuccess={() => handleDrawerChange(false)}
        />
      </UserFormDrawer>

      <DeleteManagedUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        user={selectedUser}
      />
    </div>
  )
}
