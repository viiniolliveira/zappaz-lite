import { useAtomValue } from 'jotai'
import { KeyRound, MoreHorizontal, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { apiKeySessionsAtom, apiKeysAtom, revokeApiKeyAtom } from '@/atoms/api-keys'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function dateLabel(value: string | Date | null | undefined, empty: string) {
  if (!value) return empty
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ApiKeysTable() {
  const keys = useAtomValue(apiKeysAtom)
  const sessions = useAtomValue(apiKeySessionsAtom)
  const revoke = useAtomValue(revokeApiKeyAtom)
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null)
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const filtered = keys.data?.apiKeys.filter((key) =>
    (key.name ?? '').toLocaleLowerCase('pt-BR').includes(query),
  )

  return (
    <>
      <section
        aria-label="Chaves de API cadastradas"
        className="min-w-0 overflow-hidden rounded-lg border bg-background"
      >
        <div className="border-b p-4">
          <div className="relative max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Buscar chaves por nome"
              placeholder="Buscar por nome…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {keys.isPending ? (
          <div role="status" aria-label="Carregando chaves" className="space-y-4 p-5">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-12 w-full" />
            ))}
          </div>
        ) : keys.isError ? (
          <div role="alert" className="space-y-3 p-6">
            <p className="text-sm">{keys.error.message}</p>
            <Button variant="outline" onClick={() => void keys.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <Table aria-label="Chaves de API">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Nome</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-14 pr-4">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filtered?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-44 text-center">
                      <KeyRound
                        className="mx-auto mb-3 size-6 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="font-medium">
                        {query ? 'Nenhuma chave encontrada' : 'Nenhuma chave criada'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {query
                          ? 'Tente buscar por outro nome.'
                          : 'Clique em “Nova chave” para conectar sua primeira integração.'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((key) => {
                    const expired =
                      !!key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()
                    const inactive = expired || !key.enabled
                    return (
                      <TableRow key={key.id}>
                        <TableCell className="max-w-72 py-5 pl-5">
                          <p className="truncate font-medium" title={key.name ?? undefined}>
                            {key.name}
                          </p>
                          <code className="mt-1 block text-xs text-muted-foreground">
                            {key.start}…
                          </code>
                        </TableCell>
                        <TableCell>
                          {key.permissions?.global?.includes('sessions')
                            ? 'Global'
                            : key.permissions?.sessions?.[0]
                              ? (sessions.data?.find(
                                  (session) => session.id === key.permissions?.sessions?.[0],
                                )?.displayName ?? 'Sessão indisponível')
                              : 'Sem acesso'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {dateLabel(key.createdAt, '—')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {dateLabel(key.expiresAt, 'Sem expiração')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {dateLabel(key.lastRequest, 'Nunca utilizada')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inactive ? 'secondary' : 'outline'}>
                            {expired ? 'Expirada' : key.enabled ? 'Ativa' : 'Desativada'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Ações da chave ${key.name}`}
                                disabled={revoke.isPending}
                              >
                                <MoreHorizontal aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() =>
                                  setTarget({ id: key.id, name: key.name ?? 'Chave de API' })
                                }
                              >
                                <Trash2 aria-hidden="true" />
                                Revogar chave
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
            <div className="border-t px-5 py-3 text-xs text-muted-foreground" role="status">
              {query
                ? `${filtered?.length} de ${keys.data.apiKeys.length} chaves`
                : `${keys.data.apiKeys.length} ${keys.data.apiKeys.length === 1 ? 'chave' : 'chaves'}`}
            </div>
          </>
        )}
      </section>
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) setTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar chave?</DialogTitle>
            <DialogDescription>
              A integração “{target?.name}” perderá o acesso imediatamente. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={revoke.isPending} onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={async () => {
                if (!target) return
                try {
                  await revoke.mutateAsync(target.id)
                  setTarget(null)
                } catch {
                  // O átomo apresenta o erro e mantém a confirmação aberta.
                }
              }}
            >
              {revoke.isPending ? 'Revogando…' : 'Revogar chave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
