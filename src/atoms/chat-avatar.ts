import { atom } from 'jotai'
import { atomWithMutation, queryClientAtom } from 'jotai-tanstack-query'
import { isAvatarExpired } from '@/lib/chat/avatar'
import { chatKeys, mergeEntities } from '@/lib/chat/merge'
import type { ContactDTO } from '@/lib/chat/schemas'
import { refreshChatContactAvatar } from '@/services/chat'
import { chatAccessDeniedAtom, chatLiveCacheAtom, chatSessionStateAtom } from './chat-cache'
import { chatSessionIdAtom } from './ui'

export const chatAvatarRefreshMutationAtom = atomWithMutation((get) => ({
  mutationKey: ['chat', 'refresh-avatar'],
  retry: false,
  mutationFn: ({ sessionId, id }: ContactDTO) =>
    // fetchQuery shares in-flight work across cards, without extending the database timestamp.
    get(queryClientAtom).fetchQuery({
      queryKey: chatKeys.avatar(sessionId, id),
      staleTime: 0,
      retry: false,
      queryFn: () => refreshChatContactAvatar(sessionId, id),
    }),
}))

export const refreshChatAvatarAtom = atom(null, async (get, set, contact: ContactDTO) => {
  const sessionId = get(chatSessionIdAtom)
  const session = get(chatSessionStateAtom)
  if (
    sessionId !== contact.sessionId ||
    get(chatAccessDeniedAtom) ||
    !session?.connected ||
    !session.enabled
  )
    return
  const live = get(chatLiveCacheAtom).contacts.find(
    (item) => item.id === contact.id && item.sessionId === sessionId,
  )
  const current = live && live.revision > contact.revision ? live : contact
  if (!isAvatarExpired(current.avatarCheckedAt)) return
  const updated = await get(chatAvatarRefreshMutationAtom).mutateAsync(current)
  if (get(chatSessionIdAtom) !== sessionId || get(chatAccessDeniedAtom)) return
  set(chatLiveCacheAtom, (cache) => ({
    ...cache,
    contacts: mergeEntities(cache.contacts, [updated], sessionId),
  }))
})
