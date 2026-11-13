import { expect, test } from 'bun:test'
import { ChartNoAxesCombined } from 'lucide-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EmptyState } from '../../src/components/empty-state.tsx'
import TableLogsContent from '../../src/components/logs/TableLogsContent.tsx'

test('empty state exposes its guidance as a status and hides decorative artwork', () => {
  const html = renderToStaticMarkup(createElement(EmptyState, {
    icon: ChartNoAxesCombined,
    title: 'Selecione uma sessão',
    description: 'Use os filtros acima para consultar o uso.',
  }))

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('Selecione uma sessão</h2>')
  expect(html).toContain('Use os filtros acima para consultar o uso.')
})

test('empty logs table keeps its columns and explains when records will appear', () => {
  const html = renderToStaticMarkup(createElement('table', null,
    createElement('tbody', null, createElement(TableLogsContent, {
      logs: [],
      onViewDetails: () => {},
    })),
  ))

  expect(html).toContain('colSpan="5"')
  expect(html).toContain('role="status"')
  expect(html).toContain('Nenhum log por aqui ainda')
  expect(html).toContain('quando houver eventos para este webhook')
  expect(html).not.toContain('<button')
})
