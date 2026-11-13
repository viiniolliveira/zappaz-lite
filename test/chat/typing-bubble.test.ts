import { expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageHistory from '../../src/components/chat/message-history.tsx'
import TypingBubble from '../../src/components/chat/typing-bubble.tsx'

test('typing bubble has three staggered dots, reduced-motion support and an accessible label', () => {
  const html = renderToStaticMarkup(createElement(TypingBubble, { displayName: 'Maria' }))
  expect(html).toContain('role="status"')
  expect(html).toContain('aria-label="Maria está digitando"')
  expect(html.match(/<span/g)).toHaveLength(3)
  for (const delay of [0, 150, 300]) expect(html).toContain(`animation-delay:${delay}ms`)
  expect(html).toContain('motion-safe:animate-')
  expect(html).not.toContain('<button')
})

test('history renders the bubble only when typing, without a fake message or empty prompt', () => {
  const props = { conversationId: 'conversation', displayName: 'Maria', messages: [] }
  const active = renderToStaticMarkup(createElement(MessageHistory, { ...props, typing: true }))
  const inactive = renderToStaticMarkup(createElement(MessageHistory, props))
  expect(active).toContain('data-slot="typing-bubble"')
  expect(active).not.toContain('data-message-id')
  expect(active).not.toContain('Envie a primeira')
  expect(inactive).not.toContain('data-slot="typing-bubble"')
  expect(inactive).toContain('Envie a primeira')
})
