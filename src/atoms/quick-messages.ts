import { atom } from 'jotai'
import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import type { QuickMessageInput } from '@/lib/chat/quick-messages'
import { deleteQuickMessage, getQuickMessages, saveQuickMessage } from '@/services/quick-messages'
import { chatAccessDeniedAtom, chatSubscribedAtom, chatSubscribedSessionIdAtom } from './chat-cache'
import { chatSessionIdAtom } from './ui'

export const quickMessageKeys = {
  list: (sessionId: string) => ['chat', sessionId, 'quick-messages'] as const,
}
export const quickMessagesAtom = atomWithQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  return {
    queryKey: quickMessageKeys.list(sessionId),
    enabled:
      !!sessionId &&
      !get(chatAccessDeniedAtom) &&
      get(chatSubscribedAtom) &&
      get(chatSubscribedSessionIdAtom) === sessionId,
    retry: false,
    queryFn: ({ signal }) => getQuickMessages(sessionId, signal),
  }
})
type QuickMessageAction =
  | { action: 'save'; input: QuickMessageInput; id?: string }
  | { action: 'delete'; id: string }
type QuickMessageMutation = QuickMessageAction & { sessionId: string }
export const quickMessageMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'manage-quick-message'],
  retry: false,
  mutationFn: (input: QuickMessageMutation) =>
    input.action === 'delete'
      ? deleteQuickMessage(input.sessionId, input.id)
      : saveQuickMessage(input.sessionId, input.input, input.id),
  onSuccess: (_result, input: QuickMessageMutation) => {
    void get(queryClientAtom).invalidateQueries({
      queryKey: quickMessageKeys.list(input.sessionId),
    })
  },
}))
export const manageQuickMessageAtom = atom(
  null,
  async (get, _set, input: QuickMessageAction): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || get(chatAccessDeniedAtom) || get(quickMessageMutationAtom).isPending)
      return false
    try {
      await get(quickMessageMutationAtom).mutateAsync({ sessionId, ...input })
      toast.success(
        input.action === 'delete' ? 'Mensagem rápida excluída.' : 'Mensagem rápida salva.',
      )
      return true
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível atualizar as mensagens rápidas.',
      )
      return false
    }
  },
)
