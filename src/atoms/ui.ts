import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { chatDraftStorage, chatDraftStorageKey } from '@/lib/chat/draft-storage'
import type { LibraryKind } from '@/lib/chat/schemas'
import type { ChatMessage } from '@/lib/chat/types'

export const chatRepliesAtom = atom<Record<string, ChatMessage | undefined>>({})
export const chatEditMessageAtom = atom<ChatMessage | null>(null)

export const isCreateSessionModalOpenAtom = atom(false)
export const isConnectSessionModalOpenAtom = atom(false)
export const connectSessionIdAtom = atom<string | null>(null)
export const connectSessionQrCodeAtom = atom<string | null>(null)
export const chatDrawerOpenAtom = atom(false)
export const selectedChatIdAtom = atom<string | null>(null)
export const chatDeleteConversationIdsAtom = atom<string[]>([])
export const chatConversationSelectionAtom = atom<{
  sessionId: string
  ids: string[]
} | null>(null)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatLabelFilterAtom = atom<string | null>(null)
export const chatLabelManagerAtom = atom<'list' | 'create' | null>(null)
export const chatQuickMessageManagerAtom = atom<string | null>(null)
export const chatLabelTargetAtom = atom<string | null>(null)
export const chatBulkLabelsOpenAtom = atom(false)
const persistedChatDraftsAtom = atomWithStorage<Record<string, string>>(
  chatDraftStorageKey,
  {},
  chatDraftStorage,
  { getOnInit: true },
)
export const chatDraftsAtom = atom(
  (get) => get(persistedChatDraftsAtom),
  (
    get,
    set,
    update: Record<string, string> | ((drafts: Record<string, string>) => Record<string, string>),
  ) => {
    const drafts = typeof update === 'function' ? update(get(persistedChatDraftsAtom)) : update
    set(
      persistedChatDraftsAtom,
      Object.fromEntries(Object.entries(drafts).filter(([, text]) => text.length > 0)),
    )
  },
)
export const clearChatSessionDraftsAtom = atom(null, (_get, set, sessionId: string) => {
  set(chatDraftsAtom, (drafts) =>
    Object.fromEntries(Object.entries(drafts).filter(([key]) => !key.startsWith(`${sessionId}/`))),
  )
})
export const chatContactSearchAtom = atom('')
export const chatConversationSearchAtom = atom('')
export const chatContactQueryAtom = atom('')
export const chatConversationQueryAtom = atom('')
export const chatSidebarTabAtom = atom<'conversations' | 'contacts'>('conversations')
export const chatContactFormAtom = atom<{
  surface: 'dialog' | 'panel'
  contactId?: string
  name: string
  phoneNumber: string
  saved: boolean
  email?: string
  annotations?: string
} | null>(null)
export const chatContactPanelAtom = atom<{
  sessionId: string
  conversationId: string
  mediaMessageId: string | null
} | null>(null)
export const chatContactLibraryKindAtom = atom<{
  sessionId: string
  conversationId: string
  kind: LibraryKind
} | null>(null)
export const chatContactLibraryOpenAtom = atom<{
  sessionId: string
  conversationId: string
} | null>(null)
export const chatDeleteContactAtom = atom<{ id: string; displayName: string } | null>(null)
