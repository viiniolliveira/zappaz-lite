import { describe, expect, test } from 'bun:test'
import {
  chatKeys,
  mergeConversations,
  mergeEntities,
  mergeMessages,
} from '../../src/lib/chat/merge.ts'
import type { ConversationDTO } from '../../src/lib/chat/schemas.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

const otherSession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const conversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherConversation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const time = '2026-10-31T12:00:00.000Z'

describe('mergeEntities', () => {
  test('keeps a realtime revision when an older REST snapshot arrives later, regardless of timestamps', () => {
    const base = mockMessage(1, conversationId)
    const event = { ...base, revision: 3, text: 'event', updatedAt: '2026-01-01T00:00:00.000Z' }
    const rest = { ...base, revision: 2, text: 'stale REST', updatedAt: '2027-01-01T00:00:00.000Z' }
    expect(mergeEntities([event], [rest], mockSessionId)).toEqual([event])
    expect(mergeEntities([rest], [event], mockSessionId)).toEqual([event])
  })

  test('deduplicates IDs, preserves equal revisions, and excludes other sessions from both inputs', () => {
    const base = mockMessage(2, conversationId)
    const equal = { ...base, text: 'different with same revision' }
    const newer = { ...base, revision: 2, text: 'newer' }
    const foreign = { ...base, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', sessionId: otherSession }
    expect(mergeEntities([base, foreign], [equal, foreign], mockSessionId)).toEqual([base])
    expect(mergeEntities([], [base, newer, equal, newer], mockSessionId)).toEqual([newer])
  })

  test('preserves the highest revision when current contains overlapping page snapshots', () => {
    const base = mockMessage(3, conversationId)
    const newer = { ...base, revision: 3, text: 'newer snapshot' }
    const older = { ...base, revision: 1, text: 'older snapshot' }
    const current = [newer, older]

    expect(mergeEntities(current, [], mockSessionId)).toEqual([newer])
    expect(mergeMessages(current, [], mockSessionId, conversationId)).toEqual([newer])
    expect(current).toEqual([newer, older])
  })
})

describe('mergeMessages', () => {
  test('isolates session and conversation, and orders equal timestamps by internal ID ascending', () => {
    const first = mockMessage(10, conversationId, { orderAt: time })
    const second = mockMessage(11, conversationId, { orderAt: time })
    const earlier = mockMessage(12, conversationId, { orderAt: '2026-01-01T00:00:00.000Z' })
    const wrongConversation = mockMessage(13, otherConversation)
    const wrongSession = mockMessage(14, conversationId, { sessionId: otherSession })
    const current = [second, wrongConversation, wrongSession]
    const incoming = [first, earlier, second, wrongConversation, wrongSession]
    expect(mergeMessages(current, incoming, mockSessionId, conversationId)).toEqual([
      earlier,
      first,
      second,
    ])
    expect(current).toEqual([second, wrongConversation, wrongSession])
    expect(incoming).toEqual([first, earlier, second, wrongConversation, wrongSession])
  })
})

describe('mergeConversations', () => {
  test('filters non-private and foreign conversations, sorts newest first and nulls last with ID descending ties', () => {
    const base = mockConversations[0]
    const a = { ...base, id: '00000000-0000-4000-8000-000000000001', lastActivityAt: time }
    const b = { ...base, id: '00000000-0000-4000-8000-000000000002', lastActivityAt: time }
    const older = {
      ...base,
      id: '00000000-0000-4000-8000-000000000003',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    }
    const empty = { ...base, id: '00000000-0000-4000-8000-000000000004', lastActivityAt: null }
    const empty2 = { ...base, id: '00000000-0000-4000-8000-000000000005', lastActivityAt: null }
    const foreign = { ...base, id: '00000000-0000-4000-8000-000000000006', sessionId: otherSession }
    // A malformed runtime payload can bypass the static literal-false type.
    const group = {
      ...base,
      id: '00000000-0000-4000-8000-000000000007',
      isGroup: true,
    } as unknown as ConversationDTO
    expect(
      mergeConversations([empty, a, group], [older, b, empty2, foreign, a], mockSessionId),
    ).toEqual([b, a, older, empty2, empty])
  })
})

describe('chatKeys', () => {
  test('scopes cache keys by session, conversation, resource and search query', () => {
    expect(chatKeys.all).toEqual(['chat'])
    expect(chatKeys.session(mockSessionId)).toEqual(['chat', mockSessionId])
    expect(chatKeys.conversations(mockSessionId)).toEqual([
      'chat',
      mockSessionId,
      'conversations',
      '',
      null,
    ])
    expect(chatKeys.conversations(mockSessionId, '', 'label-a')).not.toEqual(
      chatKeys.conversations(mockSessionId, '', 'label-b'),
    )
    expect(chatKeys.contacts(mockSessionId, 'ana')).toEqual([
      'chat',
      mockSessionId,
      'contacts',
      'ana',
    ])
    expect(chatKeys.conversation(mockSessionId, conversationId)).toEqual([
      'chat',
      mockSessionId,
      'conversation',
      conversationId,
    ])
    expect(chatKeys.messages(mockSessionId, conversationId)).toEqual([
      'chat',
      mockSessionId,
      'messages',
      conversationId,
    ])
    expect(chatKeys.messages(mockSessionId, conversationId)).not.toEqual(
      chatKeys.messages(otherSession, conversationId),
    )
    expect(chatKeys.messages(mockSessionId, conversationId)).not.toEqual(
      chatKeys.messages(mockSessionId, otherConversation),
    )
    expect(chatKeys.conversations(mockSessionId, 'ana')).not.toEqual(
      chatKeys.conversations(mockSessionId, 'bia'),
    )
  })
})
