import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider, useAtomValue } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  chatLiveCacheAtom,
  chatSubscribedAtom,
  chatSubscribedSessionIdAtom,
} from '../../src/atoms/chat-cache'
import { chatLabelKeys } from '../../src/atoms/chat-labels'
import {
  chatBulkLabelsOpenAtom,
  chatConversationSelectionAtom,
  chatLabelFilterAtom,
  chatLabelTargetAtom,
  chatSessionIdAtom,
} from '../../src/atoms/ui'
import BulkLabelsDialog from '../../src/components/chat/bulk-labels-dialog'
import LabelBadges from '../../src/components/chat/label-badges'
import LabelEditorDialog from '../../src/components/chat/label-editor-dialog'
import LabelManager from '../../src/components/chat/label-manager'
import LabelMenu from '../../src/components/chat/label-menu'
import { api } from '../../src/lib/api-client'
import type { ChatLabel } from '../../src/lib/chat/labels'
import { mockConversations, mockSessionId } from './mock-data'

const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
})
const labels: ChatLabel[] = [
  {
    id: '00000000-0000-4000-8000-000000000801',
    sessionId: mockSessionId,
    name: 'Aguardando envio',
    description: '',
    color: '#14b8a6',
  },
  {
    id: '00000000-0000-4000-8000-000000000802',
    sessionId: mockSessionId,
    name: 'Aguardando pagamento',
    description: '',
    color: '#ef4444',
  },
  {
    id: '00000000-0000-4000-8000-000000000803',
    sessionId: mockSessionId,
    name: 'Importante',
    description: '',
    color: '#eab308',
  },
]
const conversations = mockConversations.slice(0, 2).map((item, index) => ({
  ...item,
  labelIds: index ? [labels[0].id] : [labels[0].id, labels[2].id],
}))
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
store.set(chatSubscribedAtom, true)
store.set(chatSubscribedSessionIdAtom, mockSessionId)
store.set(chatLiveCacheAtom, {
  contacts: [],
  conversations: conversations.map((conversation) => ({
    ...conversation,
    labelIds: [...conversation.labelIds],
  })),
  messages: [],
})
client.setQueryData(chatLabelKeys.list(mockSessionId), labels)
api.defaults.adapter = async (config) => {
  if (config.url?.endsWith('/conversations'))
    return {
      config,
      data: {
        status: 'success',
        data: conversations.map((conversation) => ({ ...conversation })),
        page: { hasMore: false, nextCursor: null },
      },
      headers: {},
      status: 200,
      statusText: 'OK',
    }
  let data: unknown
  const conversationId = config.url?.split('/conversations/')[1]?.split('/')[0]
  if (conversationId) {
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation) throw new Error('Unknown conversation')
    if (config.method === 'put') {
      conversation.labelIds = JSON.parse(config.data).labelIds
      conversation.revision++
    }
    data = { ...conversation }
  } else if (config.url?.includes('/conversation-labels')) {
    const id = config.url.split('/conversation-labels/')[1]
    if (config.method === 'get') data = [...labels]
    else if (config.method === 'delete') {
      labels.splice(
        labels.findIndex((label) => label.id === id),
        1,
      )
      data = { labelId: id }
    } else {
      const input = JSON.parse(config.data)
      const existing = labels.find((label) => label.id === id)
      if (existing) {
        Object.assign(existing, input)
        data = { ...existing }
      } else {
        const label = { ...input, id: crypto.randomUUID(), sessionId: mockSessionId }
        labels.push(label)
        data = label
      }
    }
  } else throw new Error(`Unexpected request ${config.url}`)
  return { config, data: { status: 'success', data }, headers: {}, status: 200, statusText: 'OK' }
}
function Fixture() {
  const cache = useAtomValue(chatLiveCacheAtom)
  const filter = useAtomValue(chatLabelFilterAtom)
  const conversation = cache.conversations.find((item) => item.id === conversations[0].id)
  if (!conversation) throw new Error('Fixture conversation not found')
  return (
    <main className="dark min-h-screen bg-background p-8 text-foreground">
      <div className="mb-8 flex items-center gap-4">
        <LabelMenu conversation={{ ...conversation, messages: [] }} />
        <LabelMenu />
        <output data-testid="filter">{filter ?? 'all'}</output>
      </div>
      <div data-testid="card-tags" className="w-64 rounded-xl bg-muted p-3">
        <LabelBadges labelIds={conversation.labelIds} singleLine />
      </div>
      <button type="button" onClick={() => store.set(chatLabelTargetAtom, conversation.id)}>
        Etiquetas pelo card
      </button>
      <div data-testid="wide-tags" className="mt-8 w-96">
        <LabelBadges labelIds={conversation.labelIds} />
      </div>
      <button
        type="button"
        className="mt-8 rounded border p-2"
        onClick={() => {
          store.set(chatConversationSelectionAtom, {
            sessionId: mockSessionId,
            ids: conversations.map((item) => item.id),
          })
          store.set(chatBulkLabelsOpenAtom, true)
        }}
      >
        Alterar etiquetas em lote
      </button>
      <output data-testid="linked">{conversation.labelIds.join(',')}</output>
      {cache.conversations.map((item) => (
        <output key={item.id} data-testid={`labels-${item.id}`}>
          {item.labelIds.join(',')}
        </output>
      ))}
      <LabelManager />
      <LabelEditorDialog />
      <BulkLabelsDialog />
    </main>
  )
}
createRoot(document.body.appendChild(document.createElement('div'))).render(
  createElement(Provider, { store }, createElement(Fixture)),
)
