import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import {
  atomWithInfiniteQuery,
  atomWithMutation,
  atomWithQuery,
  queryClientAtom,
} from 'jotai-tanstack-query'
import { toast } from 'sonner'
import { chatKeys, mergeEntities } from '@/lib/chat/merge'
import type { ContactDTO } from '@/lib/chat/schemas'
import {
  deleteChatContact,
  findSavedChatContact,
  getChatContacts,
  openChatConversation,
  saveChatContact,
  updateChatContact,
} from '@/services/chat'
import {
  applyChatConversationsAtom,
  chatAccessDeniedAtom,
  chatLiveCacheAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
} from './chat-cache'
import {
  chatContactFormAtom,
  chatContactQueryAtom,
  chatContactSearchAtom,
  chatDeleteContactAtom,
  chatSessionIdAtom,
  chatSidebarTabAtom,
  selectedChatIdAtom,
} from './ui'

export { chatContactSearchAtom }
export const chatContactPagesAtom = atomWithInfiniteQuery((get) => {
  const sessionId = get(chatSessionIdAtom) ?? ''
  const q = get(chatContactQueryAtom)
  return {
    queryKey: chatKeys.contacts(sessionId, q),
    enabled:
      !!sessionId &&
      !get(chatAccessDeniedAtom) &&
      get(chatSubscribedAtom) &&
      get(chatSubscribedSessionIdAtom) === sessionId &&
      get(chatSidebarTabAtom) === 'contacts',
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      if (pageParam !== undefined && typeof pageParam !== 'string')
        throw new Error('Cursor de contatos inválido')
      return getChatContacts(sessionId, { q, cursor: pageParam }, signal)
    },
    getNextPageParam: (last) =>
      last.page.hasMore ? (last.page.nextCursor ?? undefined) : undefined,
  }
})
export const openChatConversationMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'open-conversation'],
  retry: false,
  mutationFn: ({
    sessionId,
    ...input
  }: { sessionId: string } & ({ contactId: string } | { phoneNumber: string })) =>
    openChatConversation(sessionId, input),
}))
export const openChatContactAtom = atom(
  null,
  async (get, set, target: string | { phoneNumber: string }) => {
    const sessionId = get(chatSessionIdAtom)
    if (!sessionId || get(chatAccessDeniedAtom)) return
    const conversation = await get(openChatConversationMutationAtom).mutateAsync({
      sessionId,
      ...(typeof target === 'string' ? { contactId: target } : target),
    })
    if (get(chatSessionIdAtom) !== sessionId || get(chatAccessDeniedAtom)) return
    set(applyChatConversationsAtom, [conversation])
    set(selectedChatIdAtom, conversation.id)
    set(chatSidebarTabAtom, 'conversations')
  },
)

export const sharedContactQueryAtom = atomFamily((phoneNumber: string) =>
  atomWithQuery((get) => {
    const sessionId = get(chatSessionIdAtom) ?? ''
    return {
      queryKey: [...chatKeys.contacts(sessionId), 'shared', phoneNumber],
      enabled:
        !!sessionId &&
        !!phoneNumber &&
        !get(chatAccessDeniedAtom) &&
        get(chatSubscribedAtom) &&
        get(chatSubscribedSessionIdAtom) === sessionId,
      retry: false,
      queryFn: ({ signal }) => findSavedChatContact(sessionId, phoneNumber, signal),
    }
  }),
)

export const sharedSavedContactAtom = atomFamily((phoneNumber: string) =>
  atom((get) => {
    if (get(chatAccessDeniedAtom)) return null
    const sessionId = get(chatSessionIdAtom) ?? ''
    const queried = get(sharedContactQueryAtom(phoneNumber)).data
    return (
      mergeEntities(queried ? [queried] : [], get(chatLiveCacheAtom).contacts, sessionId).find(
        (contact) => contact.phoneNumber === phoneNumber && contact.isSaved,
      ) ?? null
    )
  }),
)

export const chatSavedContactsAtom = atom((get) => {
  if (get(chatAccessDeniedAtom)) return []
  const sessionId = get(chatSessionIdAtom) ?? ''
  const pages = get(chatContactPagesAtom).data?.pages.flatMap((page) => page.data) ?? []
  const query = get(chatContactQueryAtom).trim().toLocaleLowerCase('pt-BR')
  return mergeEntities(pages, get(chatLiveCacheAtom).contacts, sessionId)
    .filter(
      (contact) =>
        contact.isSaved &&
        (!query ||
          `${contact.displayName} ${contact.phoneNumber ?? ''} ${contact.jid} ${contact.lid ?? ''}`
            .toLocaleLowerCase('pt-BR')
            .includes(query)),
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR') || a.id.localeCompare(b.id))
})

type ContactMutation = { sessionId: string; email?: string; annotations?: string } & (
  | { action: 'create'; name: string; phoneNumber: string }
  | { action: 'edit' | 'save'; contactId: string; name: string }
  | { action: 'delete'; contactId: string }
)
export const chatContactMutationAtom = atomWithMutation(() => ({
  mutationKey: ['chat', 'manage-contact'],
  retry: false,
  mutationFn: (input: ContactMutation) => {
    if (input.action === 'create') return saveChatContact(input.sessionId, input)
    if (input.action === 'delete') return deleteChatContact(input.sessionId, input.contactId)
    return updateChatContact(input.sessionId, input.contactId, input, input.action === 'save')
  },
}))

const applyContactMutationAtom = atom(null, (get, set, contact: ContactDTO) => {
  if (get(chatSessionIdAtom) !== contact.sessionId || get(chatAccessDeniedAtom)) return
  set(chatLiveCacheAtom, (cache) => ({
    ...cache,
    contacts: mergeEntities(cache.contacts, [contact], contact.sessionId),
  }))
  void get(queryClientAtom).invalidateQueries({
    queryKey: chatKeys.contacts(contact.sessionId).slice(0, 3),
  })
  void get(queryClientAtom).invalidateQueries({
    queryKey: chatKeys.conversations(contact.sessionId).slice(0, 3),
  })
})

export const submitChatContactAtom = atom(
  null,
  async (
    get,
    set,
    input: { name: string; phoneNumber: string; email?: string; annotations?: string },
  ) => {
    const sessionId = get(chatSessionIdAtom)
    const form = get(chatContactFormAtom)
    if (!sessionId || !form || get(chatAccessDeniedAtom)) return false
    try {
      const contact = await get(chatContactMutationAtom).mutateAsync(
        form.contactId
          ? { sessionId, action: form.saved ? 'edit' : 'save', contactId: form.contactId, ...input }
          : { sessionId, action: 'create', ...input },
      )
      set(applyContactMutationAtom, contact)
      if (
        get(chatSessionIdAtom) === sessionId &&
        !get(chatAccessDeniedAtom) &&
        get(chatContactFormAtom) === form
      ) {
        set(chatContactFormAtom, null)
        toast.success(form.saved ? 'Contato atualizado' : 'Contato salvo no Zappaz')
      }
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o contato')
      return false
    }
  },
)

export const removeChatContactAtom = atom(null, async (get, set) => {
  const sessionId = get(chatSessionIdAtom)
  const target = get(chatDeleteContactAtom)
  if (!sessionId || !target || get(chatAccessDeniedAtom)) return
  try {
    const contact = await get(chatContactMutationAtom).mutateAsync({
      sessionId,
      action: 'delete',
      contactId: target.id,
    })
    set(applyContactMutationAtom, contact)
    if (
      get(chatSessionIdAtom) === sessionId &&
      !get(chatAccessDeniedAtom) &&
      get(chatDeleteContactAtom) === target
    ) {
      set(chatDeleteContactAtom, null)
      toast.success('Contato removido da agenda. A conversa foi mantida.')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Não foi possível excluir o contato')
  }
})
