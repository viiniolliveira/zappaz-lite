'use client'

import { useSetAtom } from 'jotai'
import { CirclePlus } from 'lucide-react'
import { isCreateSessionModalOpenAtom } from '@/atoms/ui'

export default function CreateSessionCard() {
  const setOpen = useSetAtom(isCreateSessionModalOpenAtom)

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative flex h-44 w-full min-w-0 flex-col justify-between overflow-hidden rounded-lg border bg-card p-4 text-center shadow-xs transition-colors hover:bg-accent/70 dark:border-accent dark:hover:bg-accent/10"
    >
      <div className="w-full h-full flex items-start gap-2">
        <div className="w-full flex h-full flex-col items-center gap-1 justify-center">
          <CirclePlus size={40} aria-hidden="true" className="mb-1 text-muted-foreground" />
          <p className="text-lg font-medium">Adicionar Sessão</p>
          <p className="text-sm text-muted-foreground">Clique para adicionar uma nova sessão</p>
        </div>
      </div>
    </button>
  )
}
