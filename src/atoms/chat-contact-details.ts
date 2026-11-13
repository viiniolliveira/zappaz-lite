import { atomFamily } from 'jotai-family'
import { atomWithInfiniteQuery, atomWithQuery } from 'jotai-tanstack-query'
import { chatKeys } from '@/lib/chat/merge'
import type { LibraryKind } from '@/lib/chat/schemas'
import { getChatLibrary, getChatMessage } from '@/services/chat'
import { chatAccessDeniedAtom, chatSubscribedAtom, chatSubscribedSessionIdAtom } from './chat-cache'
import { chatContactPanelAtom, chatSessionIdAtom, selectedChatIdAtom } from './ui'

export const chatLibraryAtom = atomFamily(
  ({
    sessionId,
    conversationId,
    kind,
  }: {
    sessionId: string
    conversationId: string | null
    kind: LibraryKind
  }) =>
    atomWithInfiniteQuery((get) => ({
      queryKey: conversationId
        ? [...chatKeys.contactMedia(sessionId, conversationId), 'library', kind]
        : [...chatKeys.session(sessionId), 'library', kind],
      enabled:
        !!sessionId &&
        sessionId === get(chatSessionIdAtom) &&
        (conversationId === null || conversationId === get(selectedChatIdAtom)) &&
        !get(chatAccessDeniedAtom) &&
        get(chatSubscribedAtom) &&
        get(chatSubscribedSessionIdAtom) === sessionId,
      retry: false,
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) => {
        if (pageParam !== undefined && typeof pageParam !== 'string')
          throw new Error('Cursor da biblioteca inválido')
        return getChatLibrary(
          sessionId,
          { conversationId: conversationId ?? undefined, kind, limit: 24, cursor: pageParam },
          signal,
        )
      },
      getNextPageParam: (page) =>
        page.page.hasMore ? (page.page.nextCursor ?? undefined) : undefined,
    })),
  (a, b) =>
    a.sessionId === b.sessionId && a.conversationId === b.conversationId && a.kind === b.kind,
)

export const chatContactLibrarySummaryAtom = atomWithQuery((get) => {
  const panel = get(chatContactPanelAtom)
  const sessionId = panel?.sessionId ?? ''
  const conversationId = panel?.conversationId ?? ''
  return {
    queryKey: [...chatKeys.contactMedia(sessionId, conversationId), 'summary'],
    enabled:
      !!panel &&
      sessionId === get(chatSessionIdAtom) &&
      conversationId === get(selectedChatIdAtom) &&
      !get(chatAccessDeniedAtom) &&
      get(chatSubscribedAtom) &&
      get(chatSubscribedSessionIdAtom) === sessionId,
    retry: false,
    queryFn: async ({ signal }) => {
      const [media, all] = await Promise.all([
        getChatLibrary(sessionId, { conversationId, kind: 'media', limit: 4 }, signal),
        getChatLibrary(sessionId, { conversationId, kind: 'all', limit: 1 }, signal),
      ])
      return { entries: media.data, count: all.count }
    },
  }
})

export const chatContactMediaMessageAtom = atomWithQuery((get) => {
  const panel = get(chatContactPanelAtom)
  const sessionId = panel?.sessionId ?? ''
  const conversationId = panel?.conversationId ?? ''
  const messageId = panel?.mediaMessageId ?? ''
  return {
    queryKey: [...chatKeys.contactMedia(sessionId, conversationId), messageId],
    enabled:
      !!messageId &&
      sessionId === get(chatSessionIdAtom) &&
      conversationId === get(selectedChatIdAtom) &&
      !get(chatAccessDeniedAtom),
    retry: false,
    queryFn: ({ signal }) => getChatMessage(sessionId, conversationId, messageId, signal),
  }
})
