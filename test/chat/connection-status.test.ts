import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { Provider, createStore } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatConnectionStatusAtom, chatKeys, chatSessionStateAtom } from '../../src/atoms/chat-cache.ts'
import { chatSessionIdAtom } from '../../src/atoms/ui.ts'
import ConversationList from '../../src/components/chat/conversation-list.tsx'


type Connection = 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'unauthorized' | 'forbidden'
type Session = { connected: boolean; enabled: boolean; syncStatus: 'idle' | 'syncing' | 'error' } | null
const connected: Session = { connected: true, enabled: true, syncStatus: 'idle' }

function render(options: { status?: Connection; session?: Session; error?: 'conversations' | 'messages'; pending?: boolean; list?: boolean; noSession?: boolean; hasMore?: boolean } = {}) {
  const store = createStore()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  store.set(queryClientAtom, client)
  store.set(chatConnectionStatusAtom, options.status ?? 'open')
  store.set(chatSessionStateAtom, options.session === undefined ? connected : options.session)
  store.set(chatSessionIdAtom, options.noSession ? null : 'session')
  if (!options.pending) client.setQueryData(chatKeys.conversations('session', ''), { pages: [], pageParams: [] })
  if (options.error) {
    const key = options.error === 'conversations' ? chatKeys.conversations('session', '') : chatKeys.messages('session', '')
    client.getQueryCache().build(client, { queryKey: key }).setState({ status: 'error', error: new Error('Falha no histórico') })
  }
  const component = options.list ? createElement(ConversationList, { conversations: [], selectedId: null, onSelect: () => {}, hasMore: options.hasMore }) : null
  return renderToStaticMarkup(createElement(Provider, { store }, component))
}

describe('conversation list without a connection footer', () => {
  test('keeps load-more inside the scrollable list and does not render the old footer', () => {
    const html = render({ list: true, hasMore: true })
    expect(html).toMatch(/<div aria-busy="false" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">[\s\S]*?Nenhuma conversa encontrada[\s\S]*?<button[^>]*>Carregar mais conversas<\/button><\/div>/)
    expect(html).not.toContain('aria-label="Conexão do chat"')
    expect(render({ list: true, hasMore: false })).not.toContain('Carregar mais conversas')
  })
})
