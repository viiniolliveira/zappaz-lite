import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageHistory from '../../src/components/chat/message-history.tsx'
import { groupChatMessages } from '../../src/lib/chat/group-messages.ts'
import { mockConversations, mockMessage } from './mock-data.ts'
import type { ChatMessage } from '../../src/lib/chat/types.ts'

const conversationId = '22222222-2222-4222-8222-222222222222'
const fixture = mockConversations[0].messages
const image = fixture.find(message => message.type === 'image')!.media!
const video = fixture.find(message => message.type === 'video')!.media!

function visual(index: number, kind: 'image' | 'video' = 'image'): ChatMessage {
  return mockMessage(index, conversationId, {
    type: kind, text: null,
    media: { ...(kind === 'image' ? image : video), duration: kind === 'video' ? 65 : null },
  })
}

function renderHistory(messages: ChatMessage[]) {
  return renderToStaticMarkup(createElement(MessageHistory, { conversationId, displayName: 'Contato', messages }))
}

describe('groupChatMessages', () => {
  test.each([0, 1, 3, 4, 5, 6])('groups only runs longer than three (%i messages), preserving order and identity', count => {
    const messages = Array.from({ length: count }, (_, index) => visual(index + 1))
    const groups = groupChatMessages(messages)
    expect(groups.map(group => group.length)).toEqual(count > 3 ? [count] : Array(count).fill(1))
    expect(groups.flat().map(message => message.id)).toEqual(messages.map(message => message.id))
    groups.flat().forEach((message, index) => expect(message).toBe(messages[index]))
  })

  test.each([
    ['sender', (message: ChatMessage) => ({ ...message, sender: { ...message.sender, jid: 'other@lid' } })],
    ['direction', (message: ChatMessage) => ({ ...message, fromMe: true })],
    ['session', (message: ChatMessage) => ({ ...message, sessionId: 'another-session' })],
    ['conversation', (message: ChatMessage) => ({ ...message, conversationId: 'another-conversation' })],
    ['day', (message: ChatMessage) => ({ ...message, orderAt: '2026-11-02T12:00:00.000Z' })],
    ['deleted', (message: ChatMessage) => ({ ...message, deletedAt: '2026-10-31T12:00:00.000Z' })],
    ['missing media', (message: ChatMessage) => ({ ...message, media: null })],
    ['mismatched media', (message: ChatMessage) => ({ ...message, media: video })],
    ['text', (message: ChatMessage) => ({ ...message, type: 'text' as const, media: null })],
    ['caption', (message: ChatMessage) => ({ ...message, text: 'Legenda da imagem' })],
    ['video', (message: ChatMessage) => ({ ...message, type: 'video' as const, media: video })],
  ])('breaks runs on %s', (_name, change) => {
    const before = Array.from({ length: 4 }, (_, i) => visual(i + 1))
    const boundary = change(visual(5))
    const after = Array.from({ length: 4 }, (_, i) => visual(i + 6))
    const messages = [...before, boundary, ...after]
    const groups = groupChatMessages(messages)
    expect(groups.map(group => group.length)).toEqual([4, 1, 4])
    expect(groups.flat()).toEqual(messages)
  })

  test('does not group videos or captioned images even in long runs', () => {
    for (const messages of [
      Array.from({ length: 5 }, (_, i) => visual(i + 1, 'video')),
      Array.from({ length: 5 }, (_, i) => ({ ...visual(i + 1), text: 'Legenda' })),
    ]) expect(groupChatMessages(messages).map(group => group.length)).toEqual([1, 1, 1, 1, 1])
  })

  test('treats empty or whitespace-only captions as absent', () => {
    const messages = [null, '', ' ', '\n\t'].map((text, i) => ({ ...visual(i + 1), text }))
    expect(groupChatMessages(messages)).toEqual([messages])
  })
})

describe('media group history rendering', () => {
  test.each([1, 2, 3])('renders %i visual messages without a grid', count => {
    const html = renderHistory(Array.from({ length: count }, (_, index) => visual(index + 1)))
    expect(html).not.toContain('data-slot="message-media-group"')
    expect((html.match(/data-message-id=/g) ?? [])).toHaveLength(count)
  })

  test('renders accessible square tiles with individual metadata, preview, gallery triggers and message content', () => {
    const messages = [visual(1), visual(2), visual(3), visual(4)]
    messages[0] = { ...messages[0], replyTo: { messageRecordId: null, messageId: 'outside', senderJid: null, type: 'text', text: 'Resposta citada', contacts: [], media: null }, reactions: [{ senderJid: '123@lid', fromMe: false, emoji: '👍', timestamp: null }] }
    const html = renderHistory(messages)
    expect(html).toContain('data-slot="message-media-group"')
    expect(html).toMatch(/<ol aria-label="4 imagens sem legenda em sequência" class="[^"]*grid-cols-2/)
    expect((html.match(/data-slot="message-metadata"/g) ?? [])).toHaveLength(4)
    expect((html.match(/data-slot="message-media-visual" class="[^"]*aspect-square/g) ?? [])).toHaveLength(4)
    expect((html.match(/class="[^"]*size-full object-cover/g) ?? [])).toHaveLength(4)
    expect((html.match(/aria-label="Abrir (?:imagem|vídeo) na galeria"/g) ?? [])).toHaveLength(4)
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/)
    for (const message of messages) {
      expect(html.split(`data-message-id="${message.id}"`)).toHaveLength(2)
    }
    expect(html).toContain('Resposta citada')
    expect(html).toContain('aria-label="Reações"')
    expect(html).toContain('👍')
  })

  test('keeps captions and videos in individual bubbles with gallery access', () => {
    const messages = [visual(1), visual(2), { ...visual(3), text: 'Legenda única' }, visual(4), visual(5), visual(6, 'video')]
    const html = renderHistory(messages)
    expect(html).not.toContain('data-slot="message-media-group"')
    expect(html).toContain('Legenda única')
    expect(html).toContain('aria-label="Abrir vídeo na galeria"')
    expect((html.match(/data-message-id=/g) ?? [])).toHaveLength(messages.length)
  })
})
