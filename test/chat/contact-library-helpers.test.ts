import { describe, expect, test } from 'bun:test'
import { DateTime } from 'luxon'
import { groupLibraryEntries, libraryLinks } from '../../src/lib/chat/library.ts'
import type { LibraryEntry } from '../../src/lib/chat/schemas.ts'
import { mockConversations, mockMessage } from './mock-data.ts'

const conversation = mockConversations[0]
const entry = (id: number, orderAt: string): LibraryEntry => ({
  message: mockMessage(id, conversation.id, { orderAt }),
  conversation: {
    id: conversation.id,
    sessionId: conversation.sessionId,
    displayName: conversation.displayName,
    avatarUrl: null,
  },
})
const now = DateTime.fromISO('2026-11-11T12:00:00', { zone: 'local' })

describe('library presentation helpers', () => {
  test('groups contact library by month while preserving order and entries', () => {
    const items = [
      entry(1, '2026-11-11T10:00:00Z'),
      entry(2, '2026-11-03T10:00:00Z'),
      entry(3, '2026-10-01T10:00:00Z'),
    ]
    const groups = groupLibraryEntries(items, false, now)
    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: '2026-11', label: 'Este mês' },
      { key: '2026-10', label: 'outubro 2026' },
    ])
    expect(groups[0].entries).toEqual(items.slice(0, 2))
    expect(groups[1].entries).toEqual(items.slice(2))
    expect(groupLibraryEntries([], false, now)).toEqual([])
  })
  test('groups session library by day, week and prior month', () => {
    const items = ['2026-11-11', '2026-11-10', '2026-11-09', '2026-11-05', '2026-10-01'].map(
      (date, index) => entry(index + 10, `${date}T12:00:00Z`),
    )
    expect(groupLibraryEntries(items, true, now).map((group) => group.label)).toEqual([
      'Hoje',
      'Ontem',
      'Esta semana',
      'Semana passada',
      'outubro 2026',
    ])
  })
  test('extracts unique safe links recursively from message formatting and preview', () => {
    const item = entry(30, '2026-11-11T12:00:00Z')
    item.message.text =
      '*https://example.com/a* https://example.com/a https://user:secret@example.com/ javascript:alert(1) https://example.org/end.'
    item.message.linkPreview = {
      url: 'https://example.com/a',
      title: null,
      description: null,
      thumbnail: null,
    }
    expect(libraryLinks(item)).toEqual(['https://example.com/a', 'https://example.org/end'])
  })
})
