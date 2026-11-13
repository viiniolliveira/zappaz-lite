import { expect, test } from 'bun:test'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chatDraftsAtom } from '../../src/atoms/ui.ts'
import MessageComposer from '../../src/components/chat/message-composer.tsx'

function renderComposer(draft = '', disabled = false) {
  const store = createStore()
  store.set(chatDraftsAtom, { conversation: draft })
  return renderToStaticMarkup(
    createElement(
      Provider,
      { store },
      createElement(MessageComposer, {
        draftKey: 'conversation',
        disabled,
        onSend: () => true,
        onAttach: () => true,
      }),
    ),
  )
}

test('composer does not reserve a footer for the newline shortcut', () => {
  const html = renderComposer('Olá')
  expect(html).not.toContain('Shift + Enter')
  expect(html).not.toContain('mt-2 flex items-center justify-between')
})
test('composer surface follows theme radius and input border without a second textarea border', () => {
  const html = renderComposer()
  const surface = html.match(/<div\b[^>]*class="([^"]*focus-within:ring-2[^"]*)"/)?.[1].split(/\s+/)
  expect(surface).toContain('rounded-lg')
  expect(surface).toContain('border')
  expect(surface).toContain('border-input')
  expect(surface).not.toContain('rounded-3xl')
  const textarea = html.match(/<textarea\b[^>]*class="([^"]*)"/)?.[1].split(/\s+/)
  expect(textarea).toContain('border-0')
  expect(textarea).toContain('rounded-none')
})
test('composer preserves disabled feedback and the near-limit counter', () => {
  expect(renderComposer('', true)).toContain('Envio indisponível · rascunho preservado')
  expect(renderComposer('a'.repeat(3601))).toContain('3601')
  expect(renderComposer('a'.repeat(3601))).toContain('/4096')
})

test('composer offers an emoji button and disables it when sending is unavailable', () => {
  expect(renderComposer()).toMatch(/<button\b[^>]*aria-label="Selecionar emoji"/)
  expect(renderComposer('', true)).toMatch(
    /<button\b[^>]*aria-label="Selecionar emoji"[^>]*disabled=""/,
  )
})
