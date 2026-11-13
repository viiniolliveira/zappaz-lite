import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sessionKeys } from '../../src/atoms/session.ts'
import SessionSelect from '../../src/components/sessions/session-select.tsx'

function render(status: string, selectedConnected?: boolean) {
  const store = createStore()
  const client = new QueryClient()
  store.set(queryClientAtom, client)
  client.setQueryData(sessionKeys.list(), { data: [{ id: 'session', displayName: 'Minha sessão', enabled: true, status, profilePictureUrl: null }] })
  return renderToStaticMarkup(createElement(Provider, { store }, createElement(SessionSelect, { value: 'session', onValueChange: () => {}, selectedConnected })))
}

describe('seletor de sessão', () => {
  test.each([['open', 'Conectada', 'bg-green-500'], ['close', 'Desconectada', 'bg-red-500']])('mostra o status %s da sessão selecionada', (status, label, color) => {
    const html = render(status)
    expect(html).toContain('Minha sessão')
    expect(html).toContain(`aria-label="${label}"`)
    expect(html).toContain(color)
  })

  test('usa o estado atualizado da sessão do chat quando disponível', () => {
    const html = render('open', false)
    expect(html).toContain('aria-label="Desconectada"')
    expect(html).toContain('bg-red-500')
  })
})
