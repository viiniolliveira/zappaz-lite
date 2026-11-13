import { atom } from 'jotai'
import { atomWithMutation, atomWithQuery, queryClientAtom } from 'jotai-tanstack-query'
import { toast } from 'sonner'
import type { BulkLabelsInput, LabelInput } from '@/lib/chat/labels'
import { chatKeys } from '@/lib/chat/merge'
import type { ConversationDTO } from '@/lib/chat/schemas'
import { getChatConversation } from '@/services/chat'
import {
  deleteChatLabel,
  getChatLabels,
  saveChatLabel,
  setChatConversationLabels,
} from '@/services/chat-labels'
import {
  applyChatConversationsAtom,
  chatAccessDeniedAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
} from './chat-cache'
import {
  chatBulkLabelsOpenAtom,
  chatConversationSelectionAtom,
  chatLabelFilterAtom,
  chatSessionIdAtom,
} from './ui'

export const chatLabelKeys = {
  list: (sessionId: string) => ['chat', sessionId, 'labels'] as const,
  selection: (sessionId: string, ids: string[]) =>
    ['chat', sessionId, 'bulk-labels', [...new Set(ids)].sort()] as const,
}
export const chatLabelsAtom = atomWithQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  return {
    queryKey: chatLabelKeys.list(sessionId),
    enabled:
      !!sessionId &&
      !get(chatAccessDeniedAtom) &&
      get(chatSubscribedAtom) &&
      get(chatSubscribedSessionIdAtom) === sessionId,
    retry: false,
    queryFn: ({ signal }) => getChatLabels(sessionId, signal),
  }
})

type LabelMutation = { sessionId: string } & (
  | { action: 'save'; input: LabelInput; labelId?: string }
  | { action: 'delete'; labelId: string }
  | { action: 'link'; conversationId: string; labelIds: string[] }
)
export const chatLabelMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'manage-label'],
  retry: false,
  mutationFn: async (input: LabelMutation): Promise<{ conversation: ConversationDTO | null }> => {
    if (input.action === 'link')
      return {
        conversation: await setChatConversationLabels(
          input.sessionId,
          input.conversationId,
          input.labelIds,
        ),
      }
    if (input.action === 'delete') await deleteChatLabel(input.sessionId, input.labelId)
    else await saveChatLabel(input.sessionId, input.input, input.labelId)
    return { conversation: null }
  },
  onSuccess: (_result: { conversation: ConversationDTO | null }, input: LabelMutation) => {
    const client = get(queryClientAtom)
    void client.invalidateQueries({ queryKey: chatLabelKeys.list(input.sessionId) })
    void client.invalidateQueries({ queryKey: chatKeys.conversations(input.sessionId).slice(0, 3) })
    if (input.action === 'link')
      void client.invalidateQueries({
        queryKey: chatKeys.conversation(input.sessionId, input.conversationId),
      })
    if (input.action === 'delete')
      void client.invalidateQueries({ queryKey: ['chat', input.sessionId, 'conversation'] })
  },
}))

export const manageChatLabelAtom = atom(
  null,
  async (
    get,
    set,
    input:
      | { action: 'save'; input: LabelInput; labelId?: string }
      | { action: 'delete'; labelId: string }
      | { action: 'link'; conversationId: string; labelIds: string[] },
  ): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || get(chatAccessDeniedAtom) || get(chatLabelMutationAtom).isPending)
      return false
    try {
      const result = await get(chatLabelMutationAtom).mutateAsync({ sessionId, ...input })
      if (get(chatSessionIdAtom) === sessionId && !get(chatAccessDeniedAtom)) {
        if (result.conversation) set(applyChatConversationsAtom, [result.conversation])
        if (input.action === 'delete' && get(chatLabelFilterAtom) === input.labelId)
          set(chatLabelFilterAtom, null)
      }
      if (input.action !== 'link')
        toast.success(
          input.action === 'delete'
            ? 'Etiqueta excluída. As conversas foram mantidas.'
            : 'Etiqueta salva no Zappaz',
        )
      return true
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível atualizar as etiquetas',
      )
      return false
    }
  },
)

export const chatBulkLabelConversationsAtom = atomWithQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  const selection = get(chatConversationSelectionAtom)
  const ids = selection?.sessionId === sessionId ? [...new Set(selection.ids)].sort() : []
  return {
    queryKey: chatLabelKeys.selection(sessionId, ids),
    enabled:
      !!sessionId && !!ids.length && get(chatBulkLabelsOpenAtom) && !get(chatAccessDeniedAtom),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) =>
      Promise.all(ids.map((id) => getChatConversation(sessionId, id, signal))),
  }
})

type BulkLabelsMutationInput = BulkLabelsInput & {
  sessionId: string
  conversationIds: string[]
}
type BulkLabelsResult = { updated: ConversationDTO[]; failed: { id: string; message: string }[] }
export const chatBulkLabelsMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'bulk-labels'],
  retry: false,
  mutationFn: async (input: BulkLabelsMutationInput): Promise<BulkLabelsResult> => {
    const updated: ConversationDTO[] = []
    const failed: BulkLabelsResult['failed'] = []
    for (const id of new Set(input.conversationIds)) {
      try {
        const conversation = await getChatConversation(input.sessionId, id)
        const labelIds = new Set(conversation.labelIds)
        for (const [labelId, checked] of Object.entries(input.changes)) {
          if (checked) labelIds.add(labelId)
          else labelIds.delete(labelId)
        }
        const changed =
          labelIds.size !== conversation.labelIds.length ||
          conversation.labelIds.some((labelId) => !labelIds.has(labelId))
        updated.push(
          changed
            ? await setChatConversationLabels(input.sessionId, id, [...labelIds])
            : conversation,
        )
      } catch (error) {
        failed.push({
          id,
          message: error instanceof Error ? error.message : 'Não foi possível alterar as etiquetas',
        })
      }
    }
    return { updated, failed }
  },
  onSuccess: (result: BulkLabelsResult, input: BulkLabelsMutationInput) => {
    const client = get(queryClientAtom)
    void client.invalidateQueries({ queryKey: chatKeys.conversations(input.sessionId).slice(0, 3) })
    if (result.failed.length)
      void client.invalidateQueries({
        queryKey: chatLabelKeys.selection(
          input.sessionId,
          result.failed.map((item) => item.id),
        ),
      })
    for (const conversation of result.updated)
      void client.invalidateQueries({
        queryKey: chatKeys.conversation(input.sessionId, conversation.id),
      })
  },
}))
export const applyChatBulkLabelsAtom = atom(
  null,
  async (get, set, input: BulkLabelsInput): Promise<boolean> => {
    const sessionId = get(chatSessionIdAtom)
    const selection = get(chatConversationSelectionAtom)
    if (
      !sessionId ||
      get(chatAccessDeniedAtom) ||
      selection?.sessionId !== sessionId ||
      !selection.ids.length ||
      !Object.keys(input.changes).length ||
      get(chatBulkLabelsMutationAtom).isPending
    )
      return false
    try {
      const result = await get(chatBulkLabelsMutationAtom).mutateAsync({
        sessionId,
        conversationIds: selection.ids,
        ...input,
      })
      if (get(chatSessionIdAtom) === sessionId && !get(chatAccessDeniedAtom)) {
        set(applyChatConversationsAtom, result.updated)
        if (get(chatConversationSelectionAtom) === selection)
          set(
            chatConversationSelectionAtom,
            result.failed.length ? { sessionId, ids: result.failed.map((item) => item.id) } : null,
          )
        if (!result.failed.length) set(chatBulkLabelsOpenAtom, false)
      }
      if (result.updated.length)
        toast.success(
          `Etiquetas atualizadas em ${result.updated.length} ${result.updated.length === 1 ? 'conversa' : 'conversas'}.`,
        )
      if (result.failed.length)
        toast.error(
          `${result.failed.length} conversas não foram atualizadas. ${result.failed[0].message}`,
        )
      return !result.failed.length
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível atualizar as etiquetas',
      )
      return false
    }
  },
)
