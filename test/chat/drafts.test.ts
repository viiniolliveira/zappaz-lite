import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toast } from 'sonner'
import {
  chatDraftsAtom,
  chatSessionIdAtom,
  clearChatSessionDraftsAtom,
} from '../../src/atoms/ui.ts'
import MessageComposer from '../../src/components/chat/message-composer.tsx'
import { chatDraftStorage, chatDraftStorageKey } from '../../src/lib/chat/draft-storage.ts'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
let entries: Map<string, string>

beforeEach(() => {
  entries = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  })
})

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'sessionStorage')
})

test('drafts remain isolated across conversations and sessions, including after reload', () => {
  const store = createStore()
  const drafts = {
    'session/a': 'Olá\n  mundo ',
    'session/b': 'Outro texto',
    'other/a': 'Outra sessão',
  }
  store.set(chatDraftsAtom, drafts)
  store.set(chatSessionIdAtom, 'session')
  store.set(chatSessionIdAtom, 'other')
  expect(store.get(chatDraftsAtom)).toEqual(drafts)
  expect(JSON.parse(entries.get(chatDraftStorageKey) ?? '{}')).toEqual(drafts)

  const reloaded = createStore()
  const unsubscribe = reloaded.sub(chatDraftsAtom, () => {})
  expect(reloaded.get(chatDraftsAtom)).toEqual(drafts)
  const html = renderToStaticMarkup(
    createElement(
      Provider,
      { store: reloaded },
      createElement(MessageComposer, {
        draftKey: 'session/a',
        onSend: () => true,
        onAttach: () => true,
      }),
    ),
  )
  expect(html).toContain('Olá\n  mundo ')
  unsubscribe()
})

test('clearing text removes its storage entry without affecting other drafts', () => {
  const store = createStore()
  store.set(chatDraftsAtom, { 's/a': 'Texto', 's/b': 'Preservado' })
  store.set(chatDraftsAtom, (drafts) => ({ ...drafts, 's/a': '' }))
  expect(store.get(chatDraftsAtom)).toEqual({ 's/b': 'Preservado' })
  store.set(chatDraftsAtom, {})
  expect(entries.has(chatDraftStorageKey)).toBe(false)
})

test('deleting a session removes only that session drafts', () => {
  const store = createStore()
  store.set(chatDraftsAtom, { 's/a': 'Texto', 's/b': 'Outro', 's2/a': 'Preservado' })
  store.set(clearChatSessionDraftsAtom, 's')
  expect(store.get(chatDraftsAtom)).toEqual({ 's2/a': 'Preservado' })
  expect(chatDraftStorage.getItem(chatDraftStorageKey, {})).toEqual({ 's2/a': 'Preservado' })
})

test('logout storage cleanup does not remove unrelated browser data', () => {
  entries.set('theme', 'dark')
  chatDraftStorage.setItem(chatDraftStorageKey, { 's/a': 'Texto' })
  chatDraftStorage.removeItem(chatDraftStorageKey)
  expect(entries.has(chatDraftStorageKey)).toBe(false)
  expect(entries.get('theme')).toBe('dark')
})

test('invalid stored drafts are rejected with explicit feedback', () => {
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const notice = spyOn(toast, 'error').mockImplementation(() => 'error')
  try {
    for (const value of ['{invalid', '{"s/a":123}', JSON.stringify({ 's/a': 'a'.repeat(4097) })]) {
      entries.set(chatDraftStorageKey, value)
      expect(chatDraftStorage.getItem(chatDraftStorageKey, {})).toEqual({})
    }
    expect(log).toHaveBeenCalledTimes(3)
    expect(notice).toHaveBeenCalledTimes(3)
  } finally {
    log.mockRestore()
    notice.mockRestore()
  }
})

test('storage failure preserves the in-memory draft and reports the persistence error', () => {
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const notice = spyOn(toast, 'error').mockImplementation(() => 'error')
  const write = spyOn(sessionStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  try {
    const store = createStore()
    store.set(chatDraftsAtom, { 's/a': 'Preservado' })
    expect(store.get(chatDraftsAtom)).toEqual({ 's/a': 'Preservado' })
    expect(notice).toHaveBeenCalledTimes(1)
  } finally {
    write.mockRestore()
    log.mockRestore()
    notice.mockRestore()
  }
})
