import { expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import ConversationList from '../../src/components/chat/conversation-list.tsx'
import ConversationListSkeleton from '../../src/components/chat/conversation-list-skeleton.tsx'
import { mockConversations } from './mock-data.ts'

function renderList(props: Partial<Parameters<typeof ConversationList>[0]> = {}) {
  const store = createStore()
  store.set(queryClientAtom, new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }))
  return renderToStaticMarkup(createElement(Provider, { store },
    createElement(MemoryRouter, null, createElement(ConversationList, {
      conversations: [], selectedId: null, onSelect: () => {}, ...props,
    })),
  ))
}

test('initial loading replaces the empty state with accessible skeletons', () => {
  const html = renderList({ loading: true })
  expect(html).toContain('aria-label="Carregando conversas"')
  expect(html).toContain('aria-busy="true"')
  expect(html).not.toContain('Nenhuma conversa encontrada')
})

test('loaded conversations remain visible during refresh and pagination', () => {
  const conversations = mockConversations
  const refresh = renderList({ conversations, loading: true })
  expect(refresh).toContain(conversations[0].displayName)
  expect(refresh).not.toContain('aria-label="Carregando conversas"')
  const pagination = renderList({ conversations, loadingMore: true, hasMore: true })
  expect(pagination).toContain(conversations[0].displayName)
  expect(pagination).toContain('aria-label="Carregando mais conversas"')
  expect(pagination).not.toContain('Carregar mais conversas')
})

test('empty state is shown after loading finishes', () => {
  const html = renderList()
  expect(html).toContain('Nenhuma conversa encontrada')
  expect(html).not.toContain('aria-label="Carregando conversas"')
})

test('conversation filters use the theme-aware button radius consistently', () => {
  const html = renderList()
  const filters = html.match(/<fieldset\b[^>]*aria-label="Filtrar conversas"[^>]*>(.*?)<\/fieldset>/s)?.[1]
  expect(filters).toBeDefined()
  const buttons = [...(filters ?? '').matchAll(/<button\b[^>]*class="([^"]*)"/g)]
  expect(buttons).toHaveLength(3)
  for (const button of buttons) {
    const classes = button[1].split(/\s+/)
    expect(classes).toContain('rounded-md')
    expect(classes).not.toContain('rounded-full')
  }
})

test('skeletons match conversation rows and respect reduced motion', () => {
  for (const loadingMore of [false, true]) {
    const html = renderToStaticMarkup(createElement(ConversationListSkeleton, { loadingMore }))
    expect((html.match(/<li /g) ?? []).length).toBe(loadingMore ? 2 : 6)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('size-11 shrink-0 rounded-full motion-reduce:animate-none')
    expect(html).not.toContain('<button')
  }
})
