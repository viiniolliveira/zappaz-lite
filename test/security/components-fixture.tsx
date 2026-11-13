import '../../src/configure-zod.ts'
import { QueryClient } from '@tanstack/react-query'
import { getDefaultStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AttachmentWorkspace from '../../src/components/chat/attachment-workspace.tsx'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations } from '../chat/mock-data.ts'
import '../../src/global.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
queryClient.setQueryData(['media', 'limits'], {
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxFileSizeMb: 10,
})
queryClient.setQueryData(['sessions', 'list'], { data: [] })
getDefaultStore().set(queryClientAtom, queryClient)

const image = mockConversations[0].messages.find((message) => message.type === 'image')
if (!image?.media) throw new Error('Synthetic image message missing')
const message = { ...image, text: 'Imagem sintética CSP' }
api.defaults.adapter = async (config) => {
  if (config.url !== image.media?.contentPath) throw new Error(`Unexpected request: ${config.url}`)
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12"><rect width="16" height="12" fill="red"/></svg>',
      ],
      { type: 'image/svg+xml' },
    ),
  }
}

function Fixture() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState('')
  return (
    <>
      <button type="button" id="open-conversation" onClick={() => setOpen(true)}>
        Abrir conversa sintética
      </button>
      {open && (
        <AttachmentWorkspace
          draftKey="csp-fixture"
          onSend={(_text, file, voice) => {
            setSent(
              JSON.stringify({
                name: file?.name,
                type: file?.type,
                size: file?.size,
                voice: !!voice,
              }),
            )
            return true
          }}
        >
          <ul>
            <MessageBubble message={message} onOpenMedia={() => {}} />
          </ul>
        </AttachmentWorkspace>
      )}
      <output id="sent">{sent}</output>
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Fixture root missing')
createRoot(root).render(<Fixture />)
