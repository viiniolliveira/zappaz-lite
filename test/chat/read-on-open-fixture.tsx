import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import ConversationPanel from '../../src/components/chat/conversation-panel'
import type { ChatConversation, ChatMessage } from '../../src/lib/chat/types'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const date = '2026-01-01T00:00:00.000Z'
function message(id: string, localStatus?: ChatMessage['localStatus']): ChatMessage {
  return { id, sessionId: 's', conversationId: 'a', messageId: id, clientRequestId: null, fromMe: false, sender: { jid: null, name: null }, type: 'text', text: id, hasLink: false, status: 'sent', sentAt: date, orderAt: date, createdAt: date, updatedAt: date, revision: 1, editedAt: null, deletedAt: null, media: null, replyTo: null, location: null, contacts: [], mentions: [], reactions: [], localStatus }
}
function conversation(id: string, messages = [message('m1')]): ChatConversation {
  return { id, labelIds: [], sessionId: 's', jid: 'contact', contactId: null, contact: null, displayName: id, avatarUrl: null, isGroup: false, lastMessage: messages.at(-1) ?? null, lastActivityAt: date, unreadCount: 1, lastReadMessageRecordId: null, createdAt: date, updatedAt: date, revision: 1, messages }
}

async function run(name: string, scenario: (render: (conversation: ChatConversation | undefined, loading?: boolean) => Promise<void>, calls: string[]) => Promise<void>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const calls: string[] = []
  const render = async (value: ChatConversation | undefined, loading = false) => {
    await act(async () => { root.render(createElement(ConversationPanel, { conversation: value, loading, onRead: (id: string) => calls.push(id), onBack: () => {}, onSend: () => true })) })
  }
  try {
    await scenario(render, calls)
    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: String(error) }
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
}
function expectCalls(calls: string[], expected: string[]) {
  if (JSON.stringify(calls) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(calls)}`)
}

const results = []
results.push(await run('opening waits for loading; a new message reports once but scroll and revisions do not', async (render, calls) => {
  const a = conversation('a')
  await render(a, true); expectCalls(calls, [])
  await render(a); expectCalls(calls, ['m1'])
  const updated = { ...a, messages: [message('m1'), message('m2')], unreadCount: 2 }
  await render(updated); expectCalls(calls, ['m1', 'm2'])
  const history = document.querySelector('[aria-label="Histórico de a"]')
  if (!history) throw new Error('history not found')
  await act(async () => { history.dispatchEvent(new Event('scroll', { bubbles: true })) })
  await render({ ...updated, messages: [message('m1'), { ...message('m2'), revision: 2, status: 'read', reactions: [{ senderJid: 'x', fromMe: false, emoji: '👍', timestamp: date }] }] })
  await render({ ...updated, messages: [{ ...message('z-old'), orderAt: '2025-01-01T00:00:00.000Z' }, ...updated.messages] })
  expectCalls(calls, ['m1', 'm2'])
}))
results.push(await run('switching or closing and reopening starts a new opening, scoped by session', async (render, calls) => {
  const a = conversation('a')
  await render(a)
  await render(conversation('b', [message('b1')]))
  await render({ ...a, messages: [message('m2')] })
  await render({ ...a, sessionId: 'other', messages: [message('m3')] })
  await render(undefined)
  await render({ ...a, messages: [message('m4')] })
  expectCalls(calls, ['m1', 'b1', 'm2', 'm3', 'm4'])
}))
results.push(await run('read, empty and already-read conversations do not report on opening', async (render, calls) => {
  await render({ ...conversation('a'), unreadCount: 0 })
  await render(conversation('b', []))
  await render({ ...conversation('c'), lastReadMessageRecordId: 'm1' })
  expectCalls(calls, [])
}))
results.push(await run('a new message waits for the unread count without advancing the baseline', async (render, calls) => {
  const initial = { ...conversation('a'), unreadCount: 0 }
  await render(initial); expectCalls(calls, [])
  const withNewMessage = { ...initial, messages: [message('m1'), message('m2')] }
  await render(withNewMessage); expectCalls(calls, [])
  await render({ ...withNewMessage, unreadCount: 1 }); expectCalls(calls, ['m2'])
  await render({ ...withNewMessage, unreadCount: 1 }); expectCalls(calls, ['m2'])
}))
results.push(await run('new messages after an initially empty conversation are marked once', async (render, calls) => {
  const empty = { ...conversation('a', []), unreadCount: 0 }
  await render(empty); expectCalls(calls, [])
  await render({ ...empty, messages: [message('m1')], unreadCount: 1 }); expectCalls(calls, ['m1'])
}))
results.push(await run('cursor ordering uses timestamp before id and id as a tie breaker', async (render, calls) => {
  const newer = { ...message('a'), orderAt: '2026-02-01T00:00:00.000Z' }
  const a = { ...conversation('a', [message('z')]), unreadCount: 0 }
  await render(a)
  await render({ ...a, messages: [...a.messages, newer], unreadCount: 1 }); expectCalls(calls, ['a'])
  await render({ ...a, messages: [...a.messages, newer, { ...newer, id: 'b', messageId: 'b' }], unreadCount: 1 }); expectCalls(calls, ['a', 'b'])
}))
results.push(await run('optimistic messages are never used as read cursors', async (render, calls) => {
  await render(conversation('a', [message('confirmed'), message('optimistic', 'sending')]))
  expectCalls(calls, ['confirmed'])
  await render(conversation('b', [message('failed', 'failed'), message('uncertain', 'uncertain')]))
  expectCalls(calls, ['confirmed'])
}))

document.body.textContent = JSON.stringify(results)
