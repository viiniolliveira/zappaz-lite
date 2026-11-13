import { atomFamily } from 'jotai-family'
import { atomWithInfiniteQuery } from 'jotai-tanstack-query'
import { chatKeys } from '@/lib/chat/merge'
import { getChatMedia } from '@/services/chat'
import { chatAccessDeniedAtom } from './chat-cache'

export const chatMediaGalleryAtom = atomFamily(
  ({ sessionId, conversationId }: { sessionId: string; conversationId: string }) =>
    atomWithInfiniteQuery((get) => ({
      queryKey: [...chatKeys.contactMedia(sessionId, conversationId), 'gallery'],
      enabled: !!sessionId && !!conversationId && !get(chatAccessDeniedAtom),
      retry: false,
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam, signal }) => {
        if (pageParam !== undefined && typeof pageParam !== 'string')
          throw new Error('Cursor de mídias inválido')
        return getChatMedia(
          sessionId,
          conversationId,
          { cursor: pageParam, kind: 'gallery', limit: 24 },
          signal,
        )
      },
      getNextPageParam: (page) =>
        page.page.hasMore ? (page.page.nextCursor ?? undefined) : undefined,
    })),
  (a, b) => a.sessionId === b.sessionId && a.conversationId === b.conversationId,
)
