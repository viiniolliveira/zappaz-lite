import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  chatAccessDeniedAtom,
  chatSessionStateAtom,
  chatSubscribedSessionIdAtom,
} from '@/atoms/chat-cache'
import { sessionsAtom } from '@/atoms/session'
import {
  chatBulkLabelsOpenAtom,
  chatContactFormAtom,
  chatContactPanelAtom,
  chatConversationSelectionAtom,
  chatDeleteContactAtom,
  chatDeleteConversationIdsAtom,
  chatLabelFilterAtom,
  chatLabelManagerAtom,
  chatLabelTargetAtom,
  chatSessionIdAtom,
  selectedChatIdAtom,
} from '@/atoms/ui'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import type { SessionSchema } from '@/services/types'

function SessionAvatar({ session, connected }: { session: SessionSchema; connected: boolean }) {
  return (
    <Avatar className="size-8 shrink-0 rounded-lg">
      {connected && session.profilePictureUrl && (
        <AvatarImage src={session.profilePictureUrl} alt="" />
      )}
      <AvatarFallback className="rounded-lg">{session.displayName.charAt(0)}</AvatarFallback>
    </Avatar>
  )
}

export default function ChatSessionPicker() {
  const [sessionId, setSessionId] = useAtom(chatSessionIdAtom)
  const sessionState = useAtomValue(chatSessionStateAtom)
  const subscribedSessionId = useAtomValue(chatSubscribedSessionIdAtom)
  const { data: response, isPending } = useAtomValue(sessionsAtom)
  const sessions = response?.data.filter((session) => session.enabled) ?? []
  const selected = sessions.find((session) => session.id === sessionId)
  const isMobile = useIsMobile()
  const isConnected = (session: SessionSchema) =>
    session.id === sessionId && sessionState && subscribedSessionId === sessionId
      ? sessionState.connected && sessionState.enabled
      : session.status === 'open'
  const connected = selected ? isConnected(selected) : false
  const setSelectedId = useSetAtom(selectedChatIdAtom)
  const setAccessDenied = useSetAtom(chatAccessDeniedAtom)
  const setContactForm = useSetAtom(chatContactFormAtom)
  const setContactPanel = useSetAtom(chatContactPanelAtom)
  const setDeleteContact = useSetAtom(chatDeleteContactAtom)
  const setSelection = useSetAtom(chatConversationSelectionAtom)
  const setDeleteConversations = useSetAtom(chatDeleteConversationIdsAtom)
  const setLabelFilter = useSetAtom(chatLabelFilterAtom)
  const setLabelManager = useSetAtom(chatLabelManagerAtom)
  const setLabelTarget = useSetAtom(chatLabelTargetAtom)
  const setBulkLabelsOpen = useSetAtom(chatBulkLabelsOpenAtom)
  const selectSession = (value: string) => {
    if (value === sessionId) return
    setSelectedId(null)
    setContactForm(null)
    setContactPanel(null)
    setDeleteContact(null)
    setSelection(null)
    setDeleteConversations([])
    setLabelFilter(null)
    setLabelManager(null)
    setLabelTarget(null)
    setBulkLabelsOpen(false)
    setAccessDenied(false)
    setSessionId(value)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending || !sessions.length}
          aria-label={
            selected
              ? `Sessão do chat: ${selected.displayName}, ${connected ? 'conectada' : 'desconectada'}`
              : 'Sessão do chat'
          }
          className="h-14 w-full min-w-0 justify-start gap-3 rounded-lg px-2 text-left data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          {selected ? (
            <>
              <SessionAvatar session={selected} connected={connected} />
              <span className="grid min-w-0 flex-1 text-sm leading-tight">
                <span className="truncate font-medium">{selected.displayName}</span>
                <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      connected ? 'bg-green-500' : 'bg-red-500',
                    )}
                  />
                  {connected ? 'Conectada' : 'Desconectada'}
                </span>
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {isPending
                ? 'Carregando sessões…'
                : sessions.length
                  ? 'Selecione uma sessão'
                  : 'Nenhuma sessão disponível'}
            </span>
          )}
          <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        align="start"
        side={isMobile ? 'bottom' : 'right'}
        sideOffset={4}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sessões</DropdownMenuLabel>
        {sessions.map((session) => {
          const connected = isConnected(session)
          return (
            <DropdownMenuItem
              key={session.id}
              onSelect={() => selectSession(session.id)}
              className="gap-2 p-2"
            >
              <SessionAvatar session={session} connected={connected} />
              <span className="min-w-0 flex-1 truncate">{session.displayName}</span>
              <span
                role="img"
                aria-label={connected ? 'Conectada' : 'Desconectada'}
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  connected ? 'bg-green-500' : 'bg-red-500',
                )}
              />
              {session.id === sessionId && (
                <Check aria-label="Sessão selecionada" className="size-4 shrink-0" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
