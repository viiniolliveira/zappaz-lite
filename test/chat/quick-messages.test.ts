import { expect, test } from 'bun:test'
import { SaveQuickMessageSchema } from '../../server/src/modules/quick-messages/schema.ts'
import { filterQuickMessages, quickMessageFormSchema, quickMessageSearch, type QuickMessage } from '../../src/lib/chat/quick-messages.ts'

const input = { name: 'Boas-vindas', command: 'ola', message: '  Olá!\nComo podemos ajudar?  ' }
test('frontend and backend validate the same quick message contract and preserve message whitespace', () => {
  for (const schema of [SaveQuickMessageSchema, quickMessageFormSchema]) {
    expect(schema.parse({ ...input, command: ' OLA ' })).toEqual({ ...input, command: 'ola' })
    for (const change of [{ name: '' }, { name: 'x'.repeat(61) }, { command: '/ola' }, { command: 'olá' }, { command: 'a b' }, { command: '' }, { command: '-ola' }, { message: ' \n ' }, { message: 'x'.repeat(4097) }])
      expect(schema.safeParse({ ...input, ...change }).success).toBe(false)
    expect(schema.parse({ ...input, message: 'x'.repeat(4096) }).message).toHaveLength(4096)
  }
})
test('slash suggestions do not hijack URLs, ordinary drafts or multiline messages', () => {
  expect(quickMessageSearch('/')).toBe('')
  expect(quickMessageSearch('/Boas')).toBe('Boas')
  for (const draft of ['', 'https://example.com/', 'Olá /ola', '/ola mensagem', '/ola\n', '//'])
    expect(quickMessageSearch(draft)).toBeNull()
})
test('quick messages filter by name or command, ignoring accents and case', () => {
  const items: QuickMessage[] = [
    { ...input, id: crypto.randomUUID(), sessionId: 'a', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { ...input, id: crypto.randomUUID(), name: 'Informações', command: 'ajuda', sessionId: 'a', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ]
  expect(filterQuickMessages(items, '')).toHaveLength(2)
  expect(filterQuickMessages(items, 'INFORMACOES')).toEqual([items[1]])
  expect(filterQuickMessages(items, '/ola')).toEqual([items[0]])
  expect(filterQuickMessages(items, 'inexistente')).toEqual([])
})
