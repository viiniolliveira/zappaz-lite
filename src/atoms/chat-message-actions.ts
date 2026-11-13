import { atomWithMutation, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { chatKeys } from '@/lib/chat/merge'
import type { MessageDTO } from '@/lib/chat/schemas'
import { deleteChatMessage, editChatMessage } from '@/services/chat'

export const editChatMessageMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'edit-message'],
  retry: false,
  mutationFn: ({
    sessionId,
    conversationId,
    id,
    text,
  }: {
    sessionId: string
    conversationId: string
    id: string
    text: string
  }) => editChatMessage(sessionId, conversationId, id, { text }),
  onSuccess: (message: MessageDTO) => {
    void get(queryClientAtom).invalidateQueries({ queryKey: chatKeys.session(message.sessionId) })
  },
  onError: () => {
    toast.error(
      'Não foi possível editar a mensagem. Confira o histórico antes de tentar novamente.',
    )
  },
}))

export const deleteChatMessageMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'delete-message'],
  retry: false,
  mutationFn: ({
    sessionId,
    conversationId,
    id,
  }: {
    sessionId: string
    conversationId: string
    id: string
  }) => deleteChatMessage(sessionId, conversationId, id),
  onSuccess: (message: MessageDTO) => {
    void get(queryClientAtom).invalidateQueries({ queryKey: chatKeys.session(message.sessionId) })
  },
  onError: () => {
    toast.error('Não foi possível apagar a mensagem para todos.')
  },
}))
