import { expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatLabelKeys } from '../../src/atoms/chat-labels.ts'
import { chatSessionIdAtom } from '../../src/atoms/ui.ts'
import LabelBadges from '../../src/components/chat/label-badges.tsx'
import { mockSessionId } from './mock-data.ts'

test('chat cards render two compact passive tags and a remainder count, never a dropdown', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const store = createStore()
  store.set(queryClientAtom, client)
  store.set(chatSessionIdAtom, mockSessionId)
  const labels = ['Aguardando envio', 'Aguardando pagamento', 'Importante'].map((name, index) => ({
    id: `00000000-0000-4000-8000-00000000080${index}`,
    sessionId: mockSessionId,
    name,
    description: '',
    color: '#14b8a6',
  }))
  client.setQueryData(chatLabelKeys.list(mockSessionId), labels)
  const markup = renderToStaticMarkup(
    createElement(
      Provider,
      { store },
      createElement(LabelBadges, { labelIds: labels.map((label) => label.id), singleLine: true }),
    ),
  )
  expect(markup).toContain('Aguardando envio</span>')
  expect(markup).toContain('Aguardando pagamento</span>')
  expect(markup).not.toContain('Importante</span>')
  expect(markup).toContain('+1</span>')
  expect(markup).toContain('Mais 1 etiquetas')
  expect(markup).toContain('flex-nowrap')
  expect(markup).toContain('truncate')
  expect(markup).toContain('py-0.5')
  expect(markup).not.toContain('<button')
  expect(markup).not.toContain('dropdown')
  client.clear()
})
