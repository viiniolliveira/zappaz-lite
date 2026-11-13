import { expect, test } from 'bun:test'
import { insertEmoji } from '../../src/lib/chat/emoji.ts'

test('inserts emojis at the cursor without losing surrounding text', () => {
  expect(insertEmoji('Olá mundo', '😀', 4, 4)).toEqual({ value: 'Olá 😀mundo', cursor: 6 })
  expect(insertEmoji('', '😀', 0, 0)).toEqual({ value: '😀', cursor: 2 })
  expect(insertEmoji('Olá', '👍🏽', 3, 3)).toEqual({ value: 'Olá👍🏽', cursor: 7 })
})

test('replaces the selected text and positions the cursor after a combined emoji', () => {
  expect(insertEmoji('Olá mundo!', '👨‍👩‍👧', 4, 9)).toEqual({
    value: 'Olá 👨‍👩‍👧!',
    cursor: 12,
  })
})

test('respects the textarea UTF-16 limit without truncating emoji sequences', () => {
  expect(insertEmoji('a'.repeat(4094), '😀', 4094, 4094)?.value.length).toBe(4096)
  expect(insertEmoji('a'.repeat(4095), '😀', 4095, 4095)).toBeNull()
  expect(insertEmoji('a'.repeat(4096), '👍🏽', 4092, 4096)?.value.length).toBe(4096)
})
