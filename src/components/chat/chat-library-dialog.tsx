import { useAtomValue } from 'jotai'
import { useRef, useState } from 'react'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { LibraryEntry, LibraryKind } from '@/lib/chat/schemas'
import ChatLibrary from './chat-library'
import MediaGallery from './media-gallery'

export default function ChatLibraryDialog({
  sessionId,
  initialKind,
  onClose,
}: {
  sessionId: string
  initialKind: LibraryKind
  onClose: () => void
}) {
  const [kind, setKind] = useState(initialKind)
  const [selected, setSelected] = useState<{ entry: LibraryEntry; blob: Blob | null } | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const denied = useAtomValue(chatAccessDeniedAtom)
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !selected) onClose()
        }}
      >
        <DialogContent
          aria-describedby="session-library-description"
          className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none md:h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] md:max-w-7xl md:rounded-lg"
          onEscapeKeyDown={(event) => {
            if (selected) event.preventDefault()
          }}
        >
          <ChatLibrary
            sessionId={sessionId}
            conversationId={null}
            kind={kind}
            onKindChange={setKind}
            onOpen={(entry, element, blob) => {
              trigger.current = element
              setSelected({ entry, blob })
            }}
            heading={
              <div className="py-4">
                <DialogTitle ref={heading} tabIndex={-1}>
                  Biblioteca
                </DialogTitle>
                <DialogDescription id="session-library-description" className="mt-1 text-xs">
                  {kind === 'media' ? 'Mídias' : kind === 'document' ? 'Documentos' : 'Links'} de
                  todas as conversas desta sessão
                </DialogDescription>
              </div>
            }
          />
        </DialogContent>
      </Dialog>
      {selected && !denied && (
        <MediaGallery
          key={`${selected.entry.message.sessionId}/${selected.entry.message.conversationId}/${selected.entry.message.id}`}
          messages={[selected.entry.message]}
          sessionId={selected.entry.message.sessionId}
          conversationId={selected.entry.message.conversationId}
          displayName={selected.entry.conversation.displayName}
          avatarUrl={selected.entry.conversation.avatarUrl}
          initialMessageId={selected.entry.message.id}
          initialBlob={selected.blob}
          onClose={() => setSelected(null)}
          onRestoreFocus={() => {
            if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true })
            else heading.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </>
  )
}
