import { atom } from 'jotai'
import { atomWithMutation } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { deleteChatConversation } from '@/services/chat'
import { forgetChatConversationAtom } from './chat-cache'
import { chatConversationSelectionAtom, chatSessionIdAtom } from './ui'

export const chatDeleteMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'delete'],
  retry: false,
  mutationFn: async ({
    sessionId,
    conversationIds,
  }: {
    sessionId: string
    conversationIds: string[]
  }) => {
    const deleted: string[] = []
    const failed: { id: string; message: string }[] = []
    let pendingCleanup = false
    for (const id of new Set(conversationIds)) {
      try {
        const result = await deleteChatConversation(sessionId, id)
        deleted.push(id)
        if (result.mediaCleanup === 'pending') pendingCleanup = true
      } catch (error) {
        failed.push({
          id,
          message: error instanceof Error ? error.message : 'Não foi possível excluir a conversa.',
        })
      }
    }
    return { deleted, failed, pendingCleanup }
  },
}))
export const deleteChatConversationsAtom = atom(
  null,
  async (get, set, conversationIds: string[]): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || !conversationIds.length || get(chatDeleteMutationAtom).isPending) return false
    try {
      const result = await get(chatDeleteMutationAtom).mutateAsync({ sessionId, conversationIds })
      for (const conversationId of result.deleted)
        set(forgetChatConversationAtom, { sessionId, conversationId })
      if (result.deleted.length) {
        if (result.pendingCleanup)
          toast.warning(
            'Conversas excluídas. A limpeza dos arquivos será repetida automaticamente.',
          )
        else
          toast.success(
            result.deleted.length === 1
              ? 'Conversa, histórico e mídias excluídos do Zappaz.'
              : `${result.deleted.length} conversas excluídas do Zappaz.`,
          )
      }
      if (result.failed.length)
        toast.error(
          `${result.failed.length > 1 ? `${result.failed.length} conversas não foram excluídas. ` : ''}${result.failed[0].message}`,
        )
      if (!result.failed.length && get(chatSessionIdAtom) === sessionId)
        set(chatConversationSelectionAtom, null)
      return result.failed.length === 0
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir a conversa. Verifique a conexão e tente novamente.',
      )
      return false
    }
  },
)
