import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ConversationPanel from '../../src/components/chat/conversation-panel.tsx'
import { mockConversations } from './mock-data.ts'

const html = renderToStaticMarkup(createElement(ConversationPanel, {
  conversation: mockConversations[0],
  onBack: () => {},
  onSend: () => true,
}))

function classes(tag: string): string[] {
  const value = tag.match(/class="([^"]*)"/)?.[1]
  if (value === undefined) throw new Error(`Missing classes: ${tag}`)
  return value.split(/\s+/)
}

describe('conversation composer layout', () => {
  test('has no top padding or border and stays in normal flow', () => {
    const form = html.match(/<form\b[^>]*>/)?.[0]
    expect(form).toBeDefined()
    const tokens = classes(form!)
    expect(tokens).toContain('pt-0')
    expect(tokens).toContain('border-0')
    expect(tokens).toContain('shrink-0')
    expect(tokens).not.toContain('absolute')
    expect(tokens).not.toContain('fixed')
    expect(tokens.some(token => /(^|:)-(mt|translate-y)-/.test(token))).toBe(false)
  })

  test('renders the independently scrollable history before the composer in a flex column', async () => {
    const history = html.match(/<section\b[^>]*aria-label="Histórico de [^"]+"[^>]*>/)?.[0]
    expect(history).toBeDefined()
    const tokens = classes(history!)
    expect(tokens).toContain('min-h-0')
    expect(tokens).toContain('flex-1')
    expect(tokens).toContain('overflow-y-auto')
    expect(tokens).toContain('pb-4')
    expect(html.indexOf(history!)).toBeLessThan(html.indexOf('<form'))
    const siblings: string[] = []
    await new HTMLRewriter()
      .on('div.flex.flex-col > section[aria-label^="Histórico de "]', { element() { siblings.push('history') } })
      .on('div.flex.flex-col > form', { element() { siblings.push('composer') } })
      .transform(new Response(html)).text()
    expect(siblings).toEqual(['history', 'composer'])
  })
})
