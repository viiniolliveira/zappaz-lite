import { toast } from 'sonner'
import { z } from 'zod'

export const chatDraftStorageKey = 'zappaz.chat.drafts'
const draftsSchema = z.record(z.string(), z.string().max(4096))

function reportStorageError(error: unknown) {
  console.error('Não foi possível persistir os rascunhos do chat', error)
  toast.error(
    'Não foi possível acessar os rascunhos nesta aba. Eles podem se perder ao recarregar.',
    {
      id: 'chat-draft-storage-error',
    },
  )
}

export const chatDraftStorage = {
  getItem(key: string, initialValue: Record<string, string>): Record<string, string> {
    try {
      if (typeof sessionStorage === 'undefined') return initialValue
      const stored = sessionStorage.getItem(key)
      return stored === null ? initialValue : draftsSchema.parse(JSON.parse(stored))
    } catch (error) {
      reportStorageError(error)
      return initialValue
    }
  },
  setItem(key: string, value: Record<string, string>): void {
    try {
      if (typeof sessionStorage === 'undefined') return
      if (Object.keys(value).length) sessionStorage.setItem(key, JSON.stringify(value))
      else sessionStorage.removeItem(key)
    } catch (error) {
      reportStorageError(error)
    }
  },
  removeItem(key: string): void {
    try {
      if (typeof sessionStorage === 'undefined') return
      sessionStorage.removeItem(key)
    } catch (error) {
      reportStorageError(error)
    }
  },
}
