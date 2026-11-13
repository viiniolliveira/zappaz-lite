import { atom } from 'jotai'
import { atomWithMutation, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { setChatConversationReadState } from '@/services/chat'
import { applyChatConversationsAtom, chatKeys } from './chat-cache'
import { chatConversationSelectionAtom, chatSessionIdAtom, selectedChatIdAtom } from './ui'

export const chatReadStateMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'read-state'],
  retry: false,
  mutationFn: async ({
    sessionId,
    conversationIds,
    read,
  }: {
    sessionId: string
    conversationIds: string[]
    read: boolean
  }) => {
    const updated: Awaited<ReturnType<typeof setChatConversationReadState>>[] = []
    const failed: { id: string; message: string }[] = []
    for (const id of new Set(conversationIds)) {
      try {
        updated.push(await setChatConversationReadState(sessionId, id, read))
      } catch (error) {
        failed.push({
          id,
          message: error instanceof Error ? error.message : 'Não foi possível atualizar a leitura.',
        })
      }
    }
    return { updated, failed }
  },
}))

export const setChatReadStateAtom = atom(
  null,
  async (
    get,
    set,
    input: {
      conversationIds: string[]
      read: boolean
    },
  ): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || !input.conversationIds.length || get(chatReadStateMutationAtom).isPending)
      return false
    try {
      const { updated, failed } = await get(chatReadStateMutationAtom).mutateAsync({
        sessionId,
        ...input,
      })
      if (get(chatSessionIdAtom) === sessionId) {
        // A manually unread open conversation must stay unread until it is opened again.
        if (
          !input.read &&
          updated.some((conversation) => conversation.id === get(selectedChatIdAtom))
        )
          set(selectedChatIdAtom, null)
        set(applyChatConversationsAtom, updated)
        if (failed.length) {
          const completed = new Set(updated.map((conversation) => conversation.id))
          set(chatConversationSelectionAtom, (selection) =>
            selection?.sessionId === sessionId
              ? { ...selection, ids: selection.ids.filter((id) => !completed.has(id)) }
              : selection,
          )
        } else set(chatConversationSelectionAtom, null)
      }
      const client = get(queryClientAtom)
      void client.invalidateQueries({ queryKey: chatKeys.conversations(sessionId).slice(0, 3) })
      for (const conversation of updated)
        void client.invalidateQueries({
          queryKey: chatKeys.conversation(sessionId, conversation.id),
        })
      if (updated.length)
        toast.success(
          updated.length === 1
            ? `Conversa marcada como ${input.read ? 'lida' : 'não lida'} no Zappaz.`
            : `${updated.length} conversas marcadas como ${input.read ? 'lidas' : 'não lidas'} no Zappaz.`,
        )
      if (failed.length)
        toast.error(
          `${failed.length > 1 ? `${failed.length} conversas não foram atualizadas. ` : ''}${failed[0].message}`,
        )
      return failed.length === 0
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a leitura.')
      return false
    }
  },
)
