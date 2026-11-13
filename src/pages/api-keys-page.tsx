import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import ApiKeysTable from './api-keys/components/api-keys-table'
import CreateKeyDialog from './api-keys/components/create-key-dialog'

export default function ApiKeysPage() {
  const [creating, setCreating] = useState(false)

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chaves de API</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie e gerencie as credenciais das suas integrações.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          Nova chave
        </Button>
      </header>
      <ApiKeysTable />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Use o header <code className="text-foreground">x-api-key</code> nas requisições. As chaves
        seguem suas permissões atuais e permitem até 120 verificações por minuto, cada uma.
      </p>
      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}
